const STORAGE_KEY = "memo-app-state-v1";
const supabaseConfig = window.MEMO_SUPABASE_CONFIG || {};

const themes = {
  sage: { accent: "#b6ddca", soft: "#e9f5ee", strong: "#487f67", ink: "#2d604b", line: "#d9e9df" },
  coral: { accent: "#f4c2c2", soft: "#fff0f0", strong: "#b96969", ink: "#824b4b", line: "#f0dada" },
  orange: { accent: "#f8d0a6", soft: "#fff4e8", strong: "#bd7a37", ink: "#895724", line: "#f1dfca" },
  yellow: { accent: "#f4e29a", soft: "#fff9de", strong: "#a58a2b", ink: "#76631b", line: "#eee4b9" },
  green: { accent: "#b6ddca", soft: "#e9f5ee", strong: "#487f67", ink: "#2d604b", line: "#d9e9df" },
  blue: { accent: "#b7d7ee", soft: "#edf7fd", strong: "#5282a3", ink: "#3a617d", line: "#d9e9f3" },
  purple: { accent: "#d6c4e8", soft: "#f5effa", strong: "#81639f", ink: "#60487a", line: "#e7dff0" }
};

const folderPalette = [
  { color: "#a98bda", soft: "#f2edfb", ink: "#81639f" },
  { color: "#e39b6b", soft: "#fff1e8", ink: "#bd7a37" },
  { color: "#7fb1d0", soft: "#edf7fc", ink: "#5282a3" },
  { color: "#b6c976", soft: "#f4f8e8", ink: "#718647" },
  { color: "#d59db4", soft: "#fbedf2", ink: "#ae6e89" }
];

const notePalette = [
  { color: "#b6ddca", soft: "#e9f5ee", ink: "#487f67" },
  { color: "#f4c2c2", soft: "#fff0f0", ink: "#b96969" },
  { color: "#f4e29a", soft: "#fff9de", ink: "#a58a2b" },
  { color: "#b7d7ee", soft: "#edf7fd", ink: "#5282a3" },
  { color: "#d6c4e8", soft: "#f5effa", ink: "#81639f" }
];

const seedState = {
  theme: "sage",
  folders: [],
  notes: [
    { id: "note-weekend", title: "週末にやりたいこと", folderId: null, favorite: true, updatedAt: "2026-08-30T10:00:00.000Z", content: "<p>朝は少し遠くまで散歩して、新しいベーカリーを探す。</p><p>午後は読みかけの本を持って、公園でゆっくり過ごす。</p>", attachments: [], palette: 0 },
    { id: "note-project", title: "プロジェクトのアイデア", folderId: null, favorite: false, updatedAt: "2026-08-29T09:30:00.000Z", content: "<h2>小さく試して、育てていく</h2><p>思いついたことを気軽に残せる、余白のある場所をつくる。</p><ul><li>最初の一歩を小さくする</li><li>続けるためのリズムをつくる</li></ul>", attachments: [], palette: 1 },
    { id: "note-meeting", title: "9月のミーティングメモ", folderId: null, favorite: false, updatedAt: "2026-08-27T05:15:00.000Z", content: "<p><strong>決めること</strong></p><ul><li>新しいスケジュールの確認</li><li>次回までの担当を整理</li><li>チームへの共有方法</li></ul>", attachments: [], palette: 3 },
    { id: "note-trip", title: "京都で行きたい場所", folderId: null, favorite: true, updatedAt: "2026-08-24T12:20:00.000Z", content: "<h2>ゆっくり歩く京都</h2><p>朝の鴨川、静かな本屋、季節の和菓子。予定を詰めすぎず、その日の気分で巡る。</p>", attachments: [], palette: 4 },
    { id: "note-reading", title: "読んでいる本から", folderId: null, favorite: false, updatedAt: "2026-08-22T03:10:00.000Z", content: "<p>「余白は、何もしない時間ではなく、次の何かが生まれるための時間。」</p>", attachments: [], palette: 2 }
  ]
};

let state = loadState();
let currentView = "home";
let currentFilter = "folders";
let currentSort = "recent";
let activeNoteId = null;
let folderDialogContext = { selectInEditor: false };
let contextMenuNoteId = null;
let toastTimer;
let supabaseClient = null;
let currentUser = null;
let realtimeChannel = null;
let cloudSyncTimer = null;
let remoteHydrateTimer = null;
let isHydratingFromCloud = false;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = { ...seedState, ...JSON.parse(saved) };
      const starterFolderIds = new Set(["folder-work", "folder-ideas", "folder-travel", "folder-private"]);
      if (parsed.folders?.some((folder) => starterFolderIds.has(folder.id))) {
        parsed.folders = parsed.folders.filter((folder) => !starterFolderIds.has(folder.id));
        parsed.notes = (parsed.notes || []).map((note) => starterFolderIds.has(note.folderId) ? { ...note, folderId: null } : note);
      }
      const normalized = normalizeStateIds(parsed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    }
  } catch (error) {
    console.warn("Could not load memo state", error);
  }
  return normalizeStateIds(structuredClone(seedState));
}

function createUuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  window.crypto?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes].map((byte, index) => `${byte.toString(16).padStart(2, "0")}${[3, 5, 7, 9].includes(index) ? "-" : ""}`).join("");
}

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeStateIds(input) {
  const folderIdMap = new Map();
  const folders = (input.folders || []).map((folder) => {
    const id = isUuid(folder.id) ? folder.id : createUuid();
    folderIdMap.set(folder.id, id);
    return { ...folder, id };
  });
  const notes = (input.notes || []).map((note) => ({
    ...note,
    id: isUuid(note.id) ? note.id : createUuid(),
    folderId: note.folderId ? (folderIdMap.get(note.folderId) || (folders.some((folder) => folder.id === note.folderId) ? note.folderId : null)) : null
  }));
  return { ...input, folders, notes };
}

function persist() {
  persistLocalState();
  updateSaveStatus("保存済み");
  if (supabaseClient && currentUser && !isHydratingFromCloud) queueCloudSync();
}

function persistLocalState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("Could not persist memo state locally", error);
  }
}

function updateSyncStatus(title, detail = "") {
  const indicatorTitle = $("#sync-indicator-title");
  const indicatorDetail = $("#sync-indicator-detail");
  const badgeText = $("#sync-badge-text");
  const settingDescription = $("#sync-setting-description");
  if (indicatorTitle) indicatorTitle.textContent = title;
  if (indicatorDetail) indicatorDetail.textContent = detail;
  if (badgeText) badgeText.textContent = title;
  if (settingDescription) settingDescription.textContent = currentUser ? detail : "ログインするとPC・スマホで共有できます";
}

function queueCloudSync() {
  updateSyncStatus("同期中…", "クラウドへ保存しています");
  window.clearTimeout(cloudSyncTimer);
  cloudSyncTimer = window.setTimeout(() => { syncStateToCloud(); }, 450);
}

function updateSaveStatus(message) {
  const status = $("#editor-save-status");
  if (status) status.textContent = message;
}

function getFolder(folderId) {
  return state.folders.find((folder) => folder.id === folderId);
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric" }).format(date);
}

function plainText(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function getCurrentNotes() {
  let notes = [...state.notes];
  if (currentView === "favorites") notes = notes.filter((note) => note.favorite);
  if (currentView.startsWith("folder:")) notes = notes.filter((note) => note.folderId === currentView.slice(7));
  if (currentView === "home" && currentFilter === "folders") notes = notes.filter((note) => !note.folderId);
  if (currentFilter === "all" || currentView.startsWith("folder:")) {
    notes.sort((a, b) => currentSort === "oldest" ? new Date(a.updatedAt) - new Date(b.updatedAt) : new Date(b.updatedAt) - new Date(a.updatedAt));
  }
  return notes;
}

function applyTheme(themeName) {
  const theme = themes[themeName] || themes.sage;
  state.theme = themeName;
  const root = document.documentElement;
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--accent-soft", theme.soft);
  root.style.setProperty("--accent-strong", theme.strong);
  root.style.setProperty("--accent-ink", theme.ink);
  root.style.setProperty("--line-strong", theme.line);
  $$(".theme-option").forEach((button) => button.classList.toggle("is-selected", button.dataset.theme === themeName));
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.soft);
}

function renderSidebar() {
  $("#all-note-count").textContent = state.notes.length;
  $("#favorite-count").textContent = state.notes.filter((note) => note.favorite).length;
  $("#sidebar-folders").innerHTML = state.folders.map((folder) => `
    <button class="nav-item ${currentView === `folder:${folder.id}` ? "is-active" : ""}" data-folder-view="${folder.id}" type="button">
      <span class="folder-icon" style="color:${folder.color}"></span>
      <span>${escapeHtml(folder.name)}</span>
      <span class="nav-count">${state.notes.filter((note) => note.folderId === folder.id).length}</span>
    </button>
  `).join("");
}

function renderFolders() {
  const section = $("#folder-section");
  if (currentView !== "home" || currentFilter !== "folders") {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  if (!state.folders.length) {
    $("#folder-grid").innerHTML = `<div class="folder-empty-state"><div class="folder-empty-illustration" aria-hidden="true"><span></span><i></i></div><div><strong>フォルダがありません</strong><p>メモをテーマごとに整理したくなったら、ここから作成できます。</p></div><button class="folder-empty-action" id="empty-folder-action" type="button">＋ フォルダを作成</button></div>`;
    return;
  }
  $("#folder-grid").innerHTML = state.folders.map((folder) => {
    const noteCount = state.notes.filter((note) => note.folderId === folder.id).length;
    return `<button class="folder-card" data-folder-view="${folder.id}" type="button" style="--folder-color:${folder.color};--folder-soft:${folder.soft}">
      <div class="folder-card-top"><span class="folder-card-icon">▰</span></div>
      <h3>${escapeHtml(folder.name)}</h3><p>${noteCount}件のメモ</p>
    </button>`;
  }).join("");
}

function renderNoteCard(note, index) {
  const folder = getFolder(note.folderId);
  const palette = folder
    ? { color: folder.color, soft: folder.soft, ink: folder.ink || folder.color }
    : { color: "#d6c4e8", soft: "#f5effa", ink: "#81639f" };
  const hasImage = note.attachments?.some((attachment) => attachment.type?.startsWith("image/"));
  const image = note.attachments?.find((attachment) => attachment.type?.startsWith("image/"));
  const cover = hasImage && image.dataUrl ? `<div class="note-cover image-cover"><img src="${image.dataUrl}" alt="" /></div>` : note.folderId === "folder-travel" ? `<div class="note-cover"><div class="note-cover-icon">⌁</div></div>` : "";
  return `<article class="note-card ${cover ? "is-image" : ""}" data-note-id="${note.id}" style="--note-color:${palette.color};--note-soft:${palette.soft};--note-ink:${palette.ink}">
    ${cover}
    <div class="note-card-top"><span class="note-folder-label">${folder ? `<i class="mini-folder-icon"></i>${escapeHtml(folder.name)}` : "<i class=\"mini-folder-icon\"></i>未分類"}</span><button class="note-more" type="button" aria-label="その他">···</button></div>
    <h3>${escapeHtml(note.title || "無題のメモ")}</h3>
    <div class="note-preview">${escapeHtml(plainText(note.content) || "内容を追加しましょう")}</div>
    <div class="note-card-bottom"><span class="note-date">${formatDate(note.updatedAt)}に編集</span>${note.attachments?.length ? `<span class="attachment-count"><span class="paperclip">⌕</span>${note.attachments.length}</span>` : ""}</div>
  </article>`;
}

function renderNotes() {
  const notes = getCurrentNotes();
  const grid = $("#notes-grid");
  grid.innerHTML = notes.map(renderNoteCard).join("");
  $("#empty-state").hidden = notes.length > 0;
  $("#empty-state h3").textContent = currentFilter === "folders" ? "未分類のメモはありません" : "まだメモがありません";
  $("#empty-state p").textContent = currentFilter === "folders" ? "フォルダに入れていないメモはここに表示されます。" : "思いついたことを、最初のメモに残してみましょう。";
  $("#notes-section-count").textContent = notes.length;
  $("#toolbar-note-count").textContent = currentView === "favorites" ? state.notes.filter((note) => note.favorite).length : state.notes.length;
  const sortControl = $("#sort-select");
  sortControl.hidden = currentView !== "home" || currentFilter !== "all";
  sortControl.value = currentSort;
  if (currentView === "favorites") $("#notes-heading").textContent = "お気に入り";
  else if (currentView.startsWith("folder:")) $("#notes-heading").textContent = `${getFolder(currentView.slice(7))?.name || "フォルダ"}のメモ`;
  else if (currentFilter === "folders") $("#notes-heading").textContent = "未分類のメモ";
  else $("#notes-heading").textContent = "すべてのメモ";
}

function renderPageHeader() {
  const isHome = currentView === "home";
  const isFavorites = currentView === "favorites";
  const folder = currentView.startsWith("folder:") ? getFolder(currentView.slice(7)) : null;
  const title = isHome ? (currentFilter === "folders" ? "フォルダ" : "すべてのメモ") : isFavorites ? "お気に入り" : folder?.name || "フォルダ";
  const description = isHome ? (currentFilter === "folders" ? "メモをテーマごとに整理したり、未分類のメモを確認できます。" : "すべてのメモを、最近使った順に並べています。") : isFavorites ? "大切なメモを、いつでもすぐに。" : `${folder?.name || "このフォルダ"}に保存されているメモです。`;
  $("#page-title").textContent = title;
  $("#page-description").textContent = description;
  $("#breadcrumb").innerHTML = `<span class="breadcrumb-home">memo</span><span class="breadcrumb-separator">/</span><span>${escapeHtml(title)}</span>`;
  $$(".primary-nav .nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.view === currentView));
}

function render() {
  applyTheme(state.theme);
  renderSidebar();
  renderPageHeader();
  renderFolders();
  renderNotes();
}

function setView(view) {
  currentView = view;
  currentFilter = view === "home" ? "folders" : "all";
  $$(".view-tab").forEach((button) => button.classList.toggle("is-active", button.dataset.filter === currentFilter));
  render();
  if (window.innerWidth <= 720) $(".sidebar").classList.remove("is-open");
}

function openFolderDialog(selectInEditor = false) {
  folderDialogContext = { selectInEditor };
  const defaultIndex = state.folders.length % folderPalette.length;
  $("#folder-name-input").value = "";
  $("#folder-color-options").innerHTML = folderPalette.map((color, index) => `<button class="folder-color-option ${index === defaultIndex ? "is-selected" : ""}" data-folder-color-index="${index}" type="button" aria-label="カラー${index + 1}" style="--folder-color:${color.color}"></button>`).join("");
  $("#folder-backdrop").hidden = false;
  requestAnimationFrame(() => { $("#folder-dialog").classList.add("is-open"); $("#folder-dialog").setAttribute("aria-hidden", "false"); $("#folder-name-input").focus(); });
}

function closeFolderDialog() {
  $("#folder-dialog").classList.remove("is-open");
  $("#folder-dialog").setAttribute("aria-hidden", "true");
  setTimeout(() => { $("#folder-backdrop").hidden = true; }, 200);
}

function confirmFolderCreation() {
  const name = $("#folder-name-input").value.trim();
  if (!name) { $("#folder-name-input").focus(); showToast("フォルダ名を入力してください"); return; }
  const selected = $(".folder-color-option.is-selected");
  const color = folderPalette[Number(selected?.dataset.folderColorIndex || 0)];
  const folder = { id: createUuid(), name, ...color };
  state.folders.push(folder);
  persist();
  closeFolderDialog();
  render();
  if (folderDialogContext.selectInEditor) {
    $("#editor-folder").innerHTML = `<option value="">未分類</option>${state.folders.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}`;
    $("#editor-folder").value = folder.id;
    saveActiveNote();
  }
  showToast(`「${folder.name}」を作成しました`);
}

function openNoteContextMenu(noteId, button) {
  const menu = $("#note-context-menu");
  const rect = button.getBoundingClientRect();
  contextMenuNoteId = noteId;
  menu.hidden = false;
  menu.style.left = `${Math.min(window.innerWidth - 128, Math.max(8, rect.right - 120))}px`;
  menu.style.top = `${Math.min(window.innerHeight - 54, rect.bottom + 6)}px`;
}

function closeNoteContextMenu() {
  contextMenuNoteId = null;
  $("#note-context-menu").hidden = true;
}

function deleteNoteById(noteId) {
  const note = state.notes.find((item) => item.id === noteId);
  if (!note || !window.confirm(`「${note.title || "無題のメモ"}」を削除しますか？`)) return;
  state.notes = state.notes.filter((item) => item.id !== noteId);
  persist();
  if (supabaseClient && currentUser) void deleteRemoteNote(noteId);
  closeNoteContextMenu();
  if (activeNoteId === noteId) closeEditor();
  else render();
  showToast("メモを削除しました");
}

function openEditor(noteId = null) {
  const note = noteId ? state.notes.find((item) => item.id === noteId) : createNote();
  if (!note) return;
  activeNoteId = note.id;
  $("#editor-title").value = note.title || "";
  $("#editor-content").innerHTML = note.content || "";
  $("#editor-folder").innerHTML = `<option value="">未分類</option>${state.folders.map((folder) => `<option value="${folder.id}">${escapeHtml(folder.name)}</option>`).join("")}`;
  $("#editor-folder").value = note.folderId || "";
  $("#editor-updated").textContent = noteId ? `${formatDate(note.updatedAt)}に編集` : "新規メモ";
  $("#favorite-editor-button").classList.toggle("is-favorite", !!note.favorite);
  $("#favorite-editor-button").textContent = note.favorite ? "★" : "☆";
  $("#editor-toolbar").classList.remove("is-visible");
  renderAttachments(note);
  $("#editor-backdrop").hidden = false;
  requestAnimationFrame(() => {
    $("#editor-backdrop").classList.add("is-visible");
    $("#editor-panel").classList.add("is-open");
    $("#editor-panel").setAttribute("aria-hidden", "false");
    $("#editor-title").focus();
  });
}

function createNote() {
  const now = new Date().toISOString();
  const defaultFolderId = currentView.startsWith("folder:") ? currentView.slice(7) : null;
  const note = { id: createUuid(), title: "", folderId: getFolder(defaultFolderId) ? defaultFolderId : null, favorite: false, updatedAt: now, content: "", attachments: [], palette: state.notes.length % notePalette.length };
  state.notes.unshift(note);
  persist();
  render();
  return note;
}

function closeEditor() {
  saveActiveNote();
  $("#editor-toolbar").classList.remove("is-visible");
  $("#editor-panel").classList.remove("is-open");
  $("#editor-panel").setAttribute("aria-hidden", "true");
  setTimeout(() => { $("#editor-backdrop").hidden = true; }, 280);
  activeNoteId = null;
  render();
}

function saveActiveNote() {
  if (!activeNoteId) return;
  const note = state.notes.find((item) => item.id === activeNoteId);
  if (!note) return;
  note.title = $("#editor-title").value.trim() || "無題のメモ";
  note.content = $("#editor-content").innerHTML;
  note.folderId = $("#editor-folder").value || null;
  note.updatedAt = new Date().toISOString();
  persist();
}

function renderAttachments(note) {
  $("#editor-attachments").innerHTML = (note.attachments || []).map((attachment, index) => `<div class="attachment-item">
    ${attachment.dataUrl || attachment.signedUrl ? `<img class="attachment-thumb" src="${attachment.dataUrl || attachment.signedUrl}" alt="" />` : `<span class="attachment-file-icon">⌁</span>`}
    <span><strong>${escapeHtml(attachment.name)}</strong><small>${attachment.size || "ファイル"}</small></span>
    <button class="remove-attachment" data-attachment-index="${index}" type="button" aria-label="添付を削除">×</button>
  </div>`).join("");
}

function formatFileSize(bytes) {
  if (!bytes) return "ファイル";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function hasSupabaseConfig() {
  return typeof window.supabase?.createClient === "function" && /^https:\/\//.test(supabaseConfig.url || "") && Boolean(supabaseConfig.publishableKey);
}

function folderVisuals(color) {
  return folderPalette.find((palette) => palette.color.toLowerCase() === (color || "").toLowerCase()) || { color: color || "#b6ddca", soft: "#edf6f0", ink: color || "#487f67" };
}

function updateAuthUi() {
  const signedOut = $("#signed-out-state");
  const signedIn = $("#signed-in-state");
  const hint = $("#auth-config-hint");
  const inputs = [$("#auth-email"), $("#auth-password"), $("#auth-login-button"), $("#auth-signup-button")];
  if (!signedOut || !signedIn) return;
  const configured = Boolean(supabaseClient);
  signedOut.hidden = Boolean(currentUser);
  signedIn.hidden = !currentUser;
  inputs.forEach((input) => { if (input) input.disabled = !configured || Boolean(currentUser); });
  if ($("#auth-user-email")) $("#auth-user-email").textContent = currentUser?.email || "ログイン中";
  if (hint) hint.textContent = configured ? "同じアカウントでログインした端末にメモが同期されます。" : "supabase-config.js にSupabaseの接続情報を設定してください。";
  if ($("#cloud-sync-description")) $("#cloud-sync-description").textContent = configured ? "同じアカウントでPCとスマホを同期します。" : "接続設定後、同じアカウントでPCとスマホを同期できます。";
}

function safeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "file";
}

async function syncStateToCloud() {
  if (!supabaseClient || !currentUser || isHydratingFromCloud) return;
  try {
    const folderRows = state.folders.map((folder, index) => ({
      id: folder.id,
      user_id: currentUser.id,
      name: folder.name,
      color: folder.color,
      sort_order: index,
      updated_at: folder.updatedAt || new Date().toISOString()
    }));
    const noteRows = state.notes.map((note) => ({
      id: note.id,
      user_id: currentUser.id,
      folder_id: note.folderId || null,
      title: note.title || "無題のメモ",
      content_html: note.content || "",
      is_favorite: Boolean(note.favorite),
      updated_at: note.updatedAt || new Date().toISOString()
    }));
    const foldersResult = folderRows.length ? await supabaseClient.from("folders").upsert(folderRows) : { error: null };
    if (foldersResult.error) throw foldersResult.error;
    const notesResult = noteRows.length ? await supabaseClient.from("notes").upsert(noteRows) : { error: null };
    if (notesResult.error) throw notesResult.error;
    updateSyncStatus("同期済み", "PC・スマホで共有中");
  } catch (error) {
    console.warn("Cloud sync failed", error);
    updateSyncStatus("同期エラー", "ローカルには保存済み");
  }
}

async function hydrateFromCloud() {
  if (!supabaseClient || !currentUser || isHydratingFromCloud) return;
  isHydratingFromCloud = true;
  updateSyncStatus("同期中…", "クラウドから読み込んでいます");
  try {
    const [foldersResult, notesResult, attachmentsResult] = await Promise.all([
      supabaseClient.from("folders").select("id,user_id,name,color,sort_order,created_at,updated_at").eq("user_id", currentUser.id).order("sort_order", { ascending: true }),
      supabaseClient.from("notes").select("id,user_id,folder_id,title,content_html,is_favorite,created_at,updated_at").eq("user_id", currentUser.id).order("updated_at", { ascending: false }),
      supabaseClient.from("note_attachments").select("id,note_id,storage_path,file_name,mime_type,file_size,created_at").eq("user_id", currentUser.id)
    ]);
    if (foldersResult.error) throw foldersResult.error;
    if (notesResult.error) throw notesResult.error;
    if (attachmentsResult.error) throw attachmentsResult.error;

    const remoteFolders = foldersResult.data || [];
    const remoteNotes = notesResult.data || [];
    const remoteAttachments = attachmentsResult.data || [];
    if (!remoteFolders.length && !remoteNotes.length && (state.folders.length || state.notes.length)) {
      isHydratingFromCloud = false;
      await syncStateToCloud();
      await setupRealtime();
      return;
    }

    const attachments = await Promise.all(remoteAttachments.map(async (attachment) => {
      let signedUrl = "";
      if (attachment.mime_type?.startsWith("image/")) {
        const signed = await supabaseClient.storage.from("note-files").createSignedUrl(attachment.storage_path, 3600);
        signedUrl = signed.data?.signedUrl || "";
      }
      return {
        remoteId: attachment.id,
        storagePath: attachment.storage_path,
        name: attachment.file_name,
        size: formatFileSize(attachment.file_size),
        type: attachment.mime_type,
        signedUrl
      };
    }));
    state = {
      ...state,
      folders: remoteFolders.map((folder) => ({ id: folder.id, name: folder.name, ...folderVisuals(folder.color), createdAt: folder.created_at, updatedAt: folder.updated_at })),
      notes: remoteNotes.map((note) => ({ id: note.id, title: note.title, folderId: note.folder_id, favorite: note.is_favorite, updatedAt: note.updated_at, createdAt: note.created_at, content: note.content_html, attachments: attachments.filter((attachment) => remoteAttachments.find((item) => item.id === attachment.remoteId)?.note_id === note.id), palette: 0 }))
    };
    persistLocalState();
    render();
    isHydratingFromCloud = false;
    await setupRealtime();
    updateSyncStatus("同期済み", "PC・スマホで共有中");
  } catch (error) {
    console.warn("Cloud hydrate failed", error);
    isHydratingFromCloud = false;
    updateSyncStatus("同期エラー", "ローカルには保存済み");
  }
}

async function setupRealtime() {
  if (!supabaseClient || !currentUser) return;
  if (realtimeChannel) await supabaseClient.removeChannel(realtimeChannel);
  const userId = currentUser.id;
  realtimeChannel = supabaseClient.channel(`memo-sync-${userId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "folders", filter: `user_id=eq.${userId}` }, queueRemoteHydrate)
    .on("postgres_changes", { event: "*", schema: "public", table: "notes", filter: `user_id=eq.${userId}` }, queueRemoteHydrate)
    .on("postgres_changes", { event: "*", schema: "public", table: "note_attachments", filter: `user_id=eq.${userId}` }, queueRemoteHydrate)
    .subscribe();
}

function queueRemoteHydrate() {
  if (isHydratingFromCloud) return;
  window.clearTimeout(remoteHydrateTimer);
  remoteHydrateTimer = window.setTimeout(() => { hydrateFromCloud(); }, 400);
}

async function loginWithPassword() {
  if (!supabaseClient) { showToast("Supabaseの接続設定が必要です"); return; }
  const email = $("#auth-email").value.trim();
  const password = $("#auth-password").value;
  if (!email || password.length < 6) { showToast("メールアドレスと6文字以上のパスワードを入力してください"); return; }
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) { showToast(error.message); return; }
  showToast("ログインしました");
}

async function signUp() {
  if (!supabaseClient) { showToast("Supabaseの接続設定が必要です"); return; }
  const email = $("#auth-email").value.trim();
  const password = $("#auth-password").value;
  if (!email || password.length < 6) { showToast("メールアドレスと6文字以上のパスワードを入力してください"); return; }
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) { showToast(error.message); return; }
  showToast(data.session ? "アカウントを作成しました" : "確認メールを送信しました");
}

async function logout() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  if (realtimeChannel) { await supabaseClient.removeChannel(realtimeChannel); realtimeChannel = null; }
  updateSyncStatus("保存済み", "このブラウザに保存");
  showToast("ログアウトしました");
}

async function uploadAttachment(file, note, attachment) {
  if (!supabaseClient || !currentUser) return;
  const storagePath = `${currentUser.id}/${note.id}/${createUuid()}-${safeFileName(file.name)}`;
  const uploadResult = await supabaseClient.storage.from("note-files").upload(storagePath, file, { upsert: false });
  if (uploadResult.error) { updateSyncStatus("同期エラー", "添付ファイルを保存できません"); return; }
  const insertResult = await supabaseClient.from("note_attachments").insert({ note_id: note.id, user_id: currentUser.id, storage_path: storagePath, file_name: file.name, mime_type: file.type || "application/octet-stream", file_size: file.size }).select().single();
  if (insertResult.error) {
    await supabaseClient.storage.from("note-files").remove([storagePath]);
    updateSyncStatus("同期エラー", "添付ファイル情報を保存できません");
    return;
  }
  attachment.storagePath = storagePath;
  attachment.remoteId = insertResult.data.id;
  persistLocalState();
  updateSyncStatus("同期済み", "添付ファイルも保存済み");
}

async function deleteRemoteNote(noteId) {
  if (!supabaseClient || !currentUser) return;
  const attachmentsResult = await supabaseClient.from("note_attachments").select("storage_path").eq("note_id", noteId).eq("user_id", currentUser.id);
  const paths = (attachmentsResult.data || []).map((attachment) => attachment.storage_path);
  if (paths.length) await supabaseClient.storage.from("note-files").remove(paths);
  const result = await supabaseClient.from("notes").delete().eq("id", noteId).eq("user_id", currentUser.id);
  if (result.error) updateSyncStatus("同期エラー", "削除を同期できません");
}

async function deleteRemoteAttachment(attachment) {
  if (!supabaseClient || !currentUser || !attachment.remoteId) return;
  if (attachment.storagePath) await supabaseClient.storage.from("note-files").remove([attachment.storagePath]);
  await supabaseClient.from("note_attachments").delete().eq("id", attachment.remoteId).eq("user_id", currentUser.id);
}

async function initializeCloudSync() {
  updateAuthUi();
  if (!hasSupabaseConfig()) {
    updateSyncStatus("保存済み", "このブラウザに保存");
    return;
  }
  try {
    supabaseClient = window.supabase.createClient(supabaseConfig.url, supabaseConfig.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    updateAuthUi();
    supabaseClient.auth.onAuthStateChange((event, session) => {
      currentUser = session?.user || null;
      updateAuthUi();
      if (currentUser && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) window.setTimeout(() => hydrateFromCloud(), 0);
      if (!currentUser) {
        if (realtimeChannel) { void supabaseClient.removeChannel(realtimeChannel); realtimeChannel = null; }
        updateSyncStatus("保存済み", "このブラウザに保存");
      }
    });
    const sessionResult = await supabaseClient.auth.getSession();
    if (sessionResult.error) throw sessionResult.error;
    currentUser = sessionResult.data.session?.user || null;
    updateAuthUi();
    if (currentUser) await hydrateFromCloud();
    else updateSyncStatus("ログイン待ち", "アカウントを設定してください");
  } catch (error) {
    console.warn("Supabase initialization failed", error);
    supabaseClient = null;
    updateAuthUi();
    updateSyncStatus("保存済み", "このブラウザに保存");
  }
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2200);
}

function updateToolbarVisibility() {
  const editor = $("#editor-content");
  const toolbar = $("#editor-toolbar");
  const selection = window.getSelection();
  const hasSelection = !!selection && selection.rangeCount > 0 && !selection.isCollapsed && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode);
  toolbar.classList.toggle("is-visible", !!activeNoteId && hasSelection);
}

function execFormat(command, value = null) {
  $("#editor-content").focus();
  if (command === "formatBlock") document.execCommand(command, false, `<${value}>`);
  else if (command === "foreColor") document.execCommand(command, false, getComputedStyle(document.documentElement).getPropertyValue("--accent-strong").trim());
  else document.execCommand(command, false, value);
  saveActiveNote();
  updateToolbarVisibility();
}

document.addEventListener("click", (event) => {
  const contextDeleteButton = event.target.closest("#context-delete-note");
  if (contextDeleteButton) { deleteNoteById(contextMenuNoteId); return; }

  const noteMoreButton = event.target.closest(".note-more");
  if (noteMoreButton) {
    const noteCard = noteMoreButton.closest("[data-note-id]");
    if (noteCard) openNoteContextMenu(noteCard.dataset.noteId, noteMoreButton);
    return;
  }

  if (!event.target.closest("#note-context-menu")) closeNoteContextMenu();

  const viewButton = event.target.closest("[data-view]");
  if (viewButton) setView(viewButton.dataset.view);

  const folderButton = event.target.closest("[data-folder-view]");
  if (folderButton) setView(`folder:${folderButton.dataset.folderView}`);

  const noteCard = event.target.closest("[data-note-id]");
  if (noteCard && !event.target.closest("button")) openEditor(noteCard.dataset.noteId);

  if (event.target.closest("#new-note-button, #primary-add-button, #mobile-add-button, #empty-add-button")) openEditor();
  if (event.target.closest("#add-folder-button, #section-add-folder, #empty-folder-action")) openFolderDialog();
  if (event.target.closest("#settings-button, #mobile-settings-button")) openSettings();
  if (event.target.closest("#close-settings-button, #settings-backdrop")) closeSettings();
  if (event.target.closest("#close-editor-button, #done-editor-button, #editor-backdrop")) closeEditor();
  if (event.target.closest("#editor-add-folder")) {
    openFolderDialog(true);
  }
  if (event.target.closest("#close-folder-dialog, #cancel-folder-dialog, #folder-backdrop")) closeFolderDialog();
  if (event.target.closest("#confirm-folder-dialog")) confirmFolderCreation();
  const folderColorOption = event.target.closest("[data-folder-color-index]");
  if (folderColorOption) {
    $$(".folder-color-option").forEach((option) => option.classList.toggle("is-selected", option === folderColorOption));
  }
  const themeOption = event.target.closest("[data-theme]");
  if (themeOption) {
    state.theme = themeOption.dataset.theme;
    applyTheme(state.theme);
    persist();
  }
  const formatButton = event.target.closest("[data-command]");
  if (formatButton) execFormat(formatButton.dataset.command, formatButton.dataset.value || null);
  if (event.target.closest("#insert-link-button")) {
    const url = window.prompt("リンク先URLを入力してください", "https://");
    if (url) execFormat("createLink", url);
  }
  if (event.target.closest("#favorite-editor-button")) {
    const note = state.notes.find((item) => item.id === activeNoteId);
    if (note) { note.favorite = !note.favorite; $("#favorite-editor-button").textContent = note.favorite ? "★" : "☆"; $("#favorite-editor-button").classList.toggle("is-favorite", note.favorite); persist(); render(); }
  }
  const removeAttachment = event.target.closest("[data-attachment-index]");
  if (removeAttachment) {
    const note = state.notes.find((item) => item.id === activeNoteId);
    if (note) {
      const [removedAttachment] = note.attachments.splice(Number(removeAttachment.dataset.attachmentIndex), 1);
      renderAttachments(note);
      persist();
      if (removedAttachment) void deleteRemoteAttachment(removedAttachment);
    }
  }
  if (event.target.closest("#delete-note-button")) {
    deleteNoteById(activeNoteId);
  }
});

$("#search-input").addEventListener("input", (event) => {
  const query = event.target.value.trim().toLowerCase();
  $$(".note-card").forEach((card) => { card.hidden = query && !card.textContent.toLowerCase().includes(query); });
});

$("#editor-title").addEventListener("input", () => { saveActiveNote(); });
$("#editor-content").addEventListener("input", () => { updateSaveStatus("保存中…"); window.clearTimeout(window.memoSaveTimer); window.memoSaveTimer = window.setTimeout(saveActiveNote, 350); });
$("#editor-content").addEventListener("mouseup", updateToolbarVisibility);
$("#editor-content").addEventListener("keyup", updateToolbarVisibility);
$("#editor-folder").addEventListener("change", saveActiveNote);
$("#editor-toolbar").addEventListener("mousedown", (event) => event.preventDefault());
document.addEventListener("selectionchange", updateToolbarVisibility);

$("#file-input").addEventListener("change", (event) => {
  const note = state.notes.find((item) => item.id === activeNoteId);
  if (!note) return;
  [...event.target.files].forEach((file) => {
    const attachment = { name: file.name, size: formatFileSize(file.size), type: file.type };
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => { attachment.dataUrl = reader.result; note.attachments.push(attachment); renderAttachments(note); persist(); void uploadAttachment(file, note, attachment); };
      reader.readAsDataURL(file);
    } else { note.attachments.push(attachment); renderAttachments(note); persist(); void uploadAttachment(file, note, attachment); }
  });
  event.target.value = "";
});

$(".view-tabs").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  currentFilter = button.dataset.filter;
  $$(".view-tab").forEach((tab) => tab.classList.toggle("is-active", tab === button));
  renderPageHeader();
  renderFolders();
  renderNotes();
});

$("#sort-select").addEventListener("change", (event) => {
  currentSort = event.target.value;
  renderNotes();
});

$("#auth-login-button").addEventListener("click", loginWithPassword);
$("#auth-signup-button").addEventListener("click", signUp);
$("#auth-logout-button").addEventListener("click", logout);

function openSettings() {
  $("#settings-backdrop").hidden = false;
  requestAnimationFrame(() => { $("#settings-panel").classList.add("is-open"); $("#settings-panel").setAttribute("aria-hidden", "false"); });
}

function closeSettings() {
  $("#settings-panel").classList.remove("is-open");
  $("#settings-panel").setAttribute("aria-hidden", "true");
  setTimeout(() => { $("#settings-backdrop").hidden = true; }, 200);
}

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("#search-input").focus(); }
  if (event.key.toLowerCase() === "n" && document.activeElement.tagName !== "INPUT" && document.activeElement.getAttribute("contenteditable") !== "true") openEditor();
  if (event.key === "Escape") { if (!$("#folder-dialog").classList.contains("is-open") && $("#editor-panel").classList.contains("is-open")) closeEditor(); else if (!$("#folder-dialog").classList.contains("is-open") && $("#settings-panel").classList.contains("is-open")) closeSettings(); else if ($("#folder-dialog").classList.contains("is-open")) closeFolderDialog(); else closeNoteContextMenu(); }
});

applyTheme(state.theme);
render();

if ("serviceWorker" in navigator && (location.protocol === "http:" || location.protocol === "https:")) {
  let hasReloadedForServiceWorker = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloadedForServiceWorker) return;
    hasReloadedForServiceWorker = true;
    window.location.reload();
  });
  navigator.serviceWorker.register("./sw.js").then((registration) => registration.update()).catch((error) => {
    console.warn("Service worker registration failed", error);
  });
}

void initializeCloudSync();
