// ============================================================
//  SharePoint document access via Microsoft Graph
//
//  LEAST PRIVILEGE: grant the app  Sites.Selected  (application),
//  then grant it read on ONLY the Governance site:
//
//    POST /sites/{site-id}/permissions
//    { "roles": ["read"],
//      "grantedToIdentities": [{ "application": {
//          "id": "<app-client-id>", "displayName": "Governance Portal" }}]}
//
//  This is the per-site equivalent of least privilege — the app
//  cannot touch any other SharePoint site in the tenant.
// ============================================================
const graph = require('../graph');
const cfg = require('../config');

// Returns the live document metadata + authoritative version label
// + a short-lived (≈1h) pre-authenticated download URL for inline preview.
async function getPolicyDocument(driveId, itemId) {
  const item = await graph
    .api(`/drives/${driveId}/items/${itemId}`)
    .select('id,name,webUrl,lastModifiedDateTime,@microsoft.graph.downloadUrl')
    .expand('listItem($expand=fields)')
    .get();

  return {
    name: item.name,
    webUrl: item.webUrl,                                   // deep link into SharePoint
    downloadUrl: item['@microsoft.graph.downloadUrl'],     // short-lived, for in-app rendering
    // SharePoint's published version label (e.g. "3.0") — the source of truth
    // that drives "re-sign required" when a new version is published.
    version: item.listItem?.fields?._UIVersionString || null,
    modified: item.lastModifiedDateTime,
  };
}

// Resolve a sharing/web URL to a drive item (handy when an admin
// pastes a SharePoint link instead of ids when creating a policy).
async function resolveSharingUrl(webUrl) {
  const b64 = Buffer.from(webUrl).toString('base64')
    .replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
  const shareId = 'u!' + b64;
  const item = await graph.api(`/shares/${shareId}/driveItem`).select('id,parentReference').get();
  return { driveId: item.parentReference.driveId, itemId: item.id };
}

// ── Browse the policy library so admins can PICK a file instead of pasting a
//    link. Uses the app-only Sites.Selected read grant.

// List all document libraries (drives) on the site — the picker's top level.
async function listLibraries() {
  const drives = await graph
    .api(`/sites/${cfg.graph.sharepointSiteId}/drives`)
    .select('id,name,webUrl')
    .get();
  return (drives.value || [])
    .map((d) => ({ name: d.name, isLibrary: true, isFolder: true, driveId: d.id, itemId: 'drive:' + d.id, webUrl: d.webUrl }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// List one folder inside a specific drive. relPath relative to that drive's root; '' = root.
async function listFolder(driveId, relPath) {
  const rel = (relPath || '').replace(/^\/+|\/+$/g, '');
  const apiPath = rel
    ? `/drives/${driveId}/root:/${encodeURI(rel)}:/children`
    : `/drives/${driveId}/root/children`;
  const res = await graph
    .api(apiPath)
    .select('id,name,webUrl,size,folder,file,lastModifiedDateTime')
    .top(200)
    .get();
  const items = (res.value || []).map((it) => ({
    name: it.name,
    isFolder: !!it.folder,
    childCount: it.folder ? it.folder.childCount : 0,
    driveId,
    itemId: it.id,
    webUrl: it.webUrl,
    size: it.size || 0,
    modified: it.lastModifiedDateTime,
  }));
  items.sort((a, b) => (a.isFolder === b.isFolder ? a.name.localeCompare(b.name) : a.isFolder ? -1 : 1));
  return { path: rel, items };
}

module.exports = { getPolicyDocument, resolveSharingUrl, listLibraries, listFolder };
