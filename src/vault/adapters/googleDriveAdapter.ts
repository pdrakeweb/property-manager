/**
 * Google Drive StorageAdapter.
 *
 * A thin wrapper around the existing browser-only `DriveClient` that takes
 * a token provider so the vault never reaches into localStorage for OAuth
 * credentials itself. A token provider callback keeps it possible to use
 * any token source — PKCE OAuth, service account, dev-mode fixed token,
 * or a hand-pasted token for manual end-to-end verification against a
 * real Google account.
 */

import { DriveClient } from '../../lib/driveClient'
import type { StorageAdapter } from '../core/types'

export type TokenProvider = () => string | Promise<string>

export function createGoogleDriveAdapter(getToken: TokenProvider): StorageAdapter {
  async function t(): Promise<string> {
    const v = await getToken()
    if (!v) throw new Error('Google Drive adapter: token provider returned empty token')
    return v
  }

  return {
    async ensureFolder(name, parentId) {
      return DriveClient.ensureFolder(await t(), name, parentId)
    },

    async resolveFolderId(folderName, rootFolderId) {
      // DriveClient.resolveFolderId takes a categoryId → internally looks up
      // CATEGORY_FOLDER_NAMES. To satisfy the vault contract (folder name in,
      // id out), we use ensureFolder directly so we don't round-trip through
      // the legacy category-id map.
      return DriveClient.ensureFolder(await t(), folderName, rootFolderId)
    },

    async listFiles(folderId) {
      return DriveClient.listFiles(await t(), folderId)
    },

    async downloadFile(fileId) {
      return DriveClient.downloadFile(await t(), fileId)
    },

    async uploadFile(folderId, filename, content, mimeType, ifMatchEtag) {
      return DriveClient.uploadFile(await t(), folderId, filename, content, mimeType, ifMatchEtag)
    },

    async updateFile(fileId, content, mimeType) {
      return DriveClient.updateFile(await t(), fileId, content, mimeType)
    },

    async searchFiles(query) {
      return DriveClient.searchFiles(await t(), query)
    },

    async searchFolders(term) {
      return DriveClient.searchFolders(await t(), term)
    },

    async getFolderName(folderId) {
      return DriveClient.getFolderName(await t(), folderId)
    },

    async listFolders(parentId) {
      return DriveClient.listFolders(await t(), parentId)
    },
  }
}
