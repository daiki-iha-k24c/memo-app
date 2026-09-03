"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { createClient } from "@supabase/supabase-js";
import type { RealtimeChannel, SupabaseClient, User } from "@supabase/supabase-js";

const STORAGE_KEY = "memo-app-state-v1";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
const HAS_SUPABASE_CONFIG = /^https:\/\//.test(SUPABASE_URL) && Boolean(SUPABASE_PUBLISHABLE_KEY);
type AnySupabaseClient = SupabaseClient;
let sharedSupabaseClient: AnySupabaseClient | null = null;

const themes = {
  sage: { label: "セージ", accent: "#b6ddca", soft: "#e9f5ee", strong: "#487f67", ink: "#2d604b", line: "#d9e9df" },
  coral: { label: "コーラル", accent: "#f4c2c2", soft: "#fff0f0", strong: "#b96969", ink: "#824b4b", line: "#f0dada" },
  orange: { label: "アプリコット", accent: "#f8d0a6", soft: "#fff4e8", strong: "#bd7a37", ink: "#895724", line: "#f1dfca" },
  yellow: { label: "バター", accent: "#f4e29a", soft: "#fff9de", strong: "#a58a2b", ink: "#76631b", line: "#eee4b9" },
  green: { label: "グリーン", accent: "#b6ddca", soft: "#e9f5ee", strong: "#487f67", ink: "#2d604b", line: "#d9e9df" },
  blue: { label: "スカイ", accent: "#b7d7ee", soft: "#edf7fd", strong: "#5282a3", ink: "#3a617d", line: "#d9e9f3" },
  purple: { label: "ラベンダー", accent: "#d6c4e8", soft: "#f5effa", strong: "#81639f", ink: "#60487a", line: "#e7dff0" }
} as const;

type ThemeName = keyof typeof themes;
type Theme = (typeof themes)[ThemeName];

const folderPalette = [
  { color: "#a98bda", soft: "#f2edfb", ink: "#81639f" },
  { color: "#e39b6b", soft: "#fff1e8", ink: "#bd7a37" },
  { color: "#7fb1d0", soft: "#edf7fc", ink: "#5282a3" },
  { color: "#b6c976", soft: "#f4f8e8", ink: "#718647" },
  { color: "#d59db4", soft: "#fbedf2", ink: "#ae6e89" }
] as const;

const notePalette = [
  { color: "#b6ddca", soft: "#e9f5ee", ink: "#487f67" },
  { color: "#f4c2c2", soft: "#fff0f0", ink: "#b96969" },
  { color: "#f4e29a", soft: "#fff9de", ink: "#a58a2b" },
  { color: "#b7d7ee", soft: "#edf7fd", ink: "#5282a3" },
  { color: "#d6c4e8", soft: "#f5effa", ink: "#81639f" }
] as const;

type Attachment = {
  name: string;
  size: string;
  type: string;
  dataUrl?: string;
  signedUrl?: string;
  storagePath?: string;
  remoteId?: string;
  localId?: string;
};

type Folder = {
  id: string;
  name: string;
  color: string;
  soft: string;
  ink: string;
  createdAt?: string;
  updatedAt?: string;
};

type Note = {
  id: string;
  title: string;
  folderId: string | null;
  favorite: boolean;
  updatedAt: string;
  createdAt?: string;
  content: string;
  attachments: Attachment[];
  palette: number;
};

type MemoState = {
  theme: ThemeName;
  folders: Folder[];
  notes: Note[];
};

type SyncStatus = { title: string; detail: string };
type ContextMenu = { noteId: string; left: number; top: number } | null;

const seedState: MemoState = {
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

function cloneSeedState(): MemoState {
  return JSON.parse(JSON.stringify(seedState)) as MemoState;
}

function createUuid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes].map((byte, index) => `${byte.toString(16).padStart(2, "0")}${[3, 5, 7, 9].includes(index) ? "-" : ""}`).join("");
}

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeStateIds(input: MemoState): MemoState {
  const folderIdMap = new Map<string, string>();
  const folders = (input.folders || []).map((folder) => {
    const id = isUuid(folder.id) ? folder.id : createUuid();
    folderIdMap.set(folder.id, id);
    return { ...folder, id };
  });
  const notes = (input.notes || []).map((note) => ({
    ...note,
    id: isUuid(note.id) ? note.id : createUuid(),
    folderId: note.folderId ? (folderIdMap.get(note.folderId) || (folders.some((folder) => folder.id === note.folderId) ? note.folderId : null)) : null,
    attachments: note.attachments || []
  }));
  return { ...input, folders, notes, theme: themes[input.theme] ? input.theme : "sage" };
}

function loadState(): MemoState {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<MemoState>;
      const starterFolderIds = new Set(["folder-work", "folder-ideas", "folder-travel", "folder-private"]);
      const merged = { ...cloneSeedState(), ...parsed, folders: parsed.folders || [], notes: parsed.notes || [] } as MemoState;
      if (merged.folders.some((folder) => starterFolderIds.has(folder.id))) {
        merged.folders = merged.folders.filter((folder) => !starterFolderIds.has(folder.id));
        merged.notes = merged.notes.map((note) => starterFolderIds.has(note.folderId || "") ? { ...note, folderId: null } : note);
      }
      const normalized = normalizeStateIds(merged);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    }
  } catch (error) {
    console.warn("Could not load memo state", error);
  }
  return normalizeStateIds(cloneSeedState());
}

function persistLocalState(memoState: MemoState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memoState));
  } catch (error) {
    console.warn("Could not persist memo state locally", error);
  }
}

function formatDate(dateString: string) {
  return new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric" }).format(new Date(dateString));
}

function plainText(html: string) {
  if (typeof window === "undefined") return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  const div = document.createElement("div");
  div.innerHTML = html || "";
  return (div.textContent || "").replace(/\s+/g, " ").trim();
}

function formatFileSize(bytes: number) {
  if (!bytes) return "ファイル";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "file";
}

function folderVisuals(color: string) {
  return folderPalette.find((palette) => palette.color.toLowerCase() === color.toLowerCase()) || { color: color || "#b6ddca", soft: "#edf6f0", ink: color || "#487f67" };
}

function normalizeUsername(value: string) {
  return value.trim().toLocaleLowerCase("ja-JP");
}

function isValidUsername(username: string) {
  return /^[\p{L}\p{N}][\p{L}\p{N}._-]{2,29}$/u.test(username);
}

function usernameKey(username: string) {
  const seeds = [2166136261, 33554467, 2654435761, 1597334677, 3812015801];
  return seeds.map((seed) => {
    let hash = seed;
    for (const character of username) {
      hash ^= character.codePointAt(0) || 0;
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }).join("");
}

function usernameToInternalEmail(username: string) {
  return `u-${usernameKey(username)}@example.com`;
}

function getSupabaseClient() {
  if (!HAS_SUPABASE_CONFIG) return null;
  if (!sharedSupabaseClient) sharedSupabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return sharedSupabaseClient;
}

async function syncStateToCloud(client: AnySupabaseClient, user: User, memoState: MemoState) {
  const folderRows = memoState.folders.map((folder, index) => ({
    id: folder.id,
    user_id: user.id,
    name: folder.name,
    color: folder.color,
    sort_order: index,
    updated_at: folder.updatedAt || new Date().toISOString()
  }));
  const noteRows = memoState.notes.map((note) => ({
    id: note.id,
    user_id: user.id,
    folder_id: note.folderId || null,
    title: note.title || "無題のメモ",
    content_html: note.content || "",
    is_favorite: Boolean(note.favorite),
    updated_at: note.updatedAt || new Date().toISOString()
  }));
  const foldersResult = folderRows.length ? await client.from("folders").upsert(folderRows) : { error: null };
  if (foldersResult.error) throw foldersResult.error;
  const notesResult = noteRows.length ? await client.from("notes").upsert(noteRows) : { error: null };
  if (notesResult.error) throw notesResult.error;
}

async function readCloudState(client: AnySupabaseClient, user: User, localState: MemoState): Promise<MemoState | null> {
  const [foldersResult, notesResult, attachmentsResult] = await Promise.all([
    client.from("folders").select("id,user_id,name,color,sort_order,created_at,updated_at").eq("user_id", user.id).order("sort_order", { ascending: true }),
    client.from("notes").select("id,user_id,folder_id,title,content_html,is_favorite,created_at,updated_at").eq("user_id", user.id).order("updated_at", { ascending: false }),
    client.from("note_attachments").select("id,note_id,storage_path,file_name,mime_type,file_size,created_at").eq("user_id", user.id)
  ]);
  if (foldersResult.error) throw foldersResult.error;
  if (notesResult.error) throw notesResult.error;
  if (attachmentsResult.error) throw attachmentsResult.error;

  const remoteFolders = foldersResult.data || [];
  const remoteNotes = notesResult.data || [];
  const remoteAttachments = attachmentsResult.data || [];
  if (!remoteFolders.length && !remoteNotes.length && (localState.folders.length || localState.notes.length)) return null;

  const attachmentsByNote = new Map<string, Attachment[]>();
  await Promise.all(remoteAttachments.map(async (attachment) => {
    let signedUrl = "";
    if (attachment.mime_type?.startsWith("image/")) {
      const signed = await client.storage.from("note-files").createSignedUrl(attachment.storage_path, 3600);
      signedUrl = signed.data?.signedUrl || "";
    }
    const item: Attachment = {
      remoteId: attachment.id,
      storagePath: attachment.storage_path,
      name: attachment.file_name,
      size: formatFileSize(attachment.file_size),
      type: attachment.mime_type,
      signedUrl
    };
    attachmentsByNote.set(attachment.note_id, [...(attachmentsByNote.get(attachment.note_id) || []), item]);
  }));

  return {
    ...localState,
    folders: remoteFolders.map((folder) => ({ id: folder.id, name: folder.name, ...folderVisuals(folder.color), createdAt: folder.created_at, updatedAt: folder.updated_at })),
    notes: remoteNotes.map((note) => ({ id: note.id, title: note.title, folderId: note.folder_id, favorite: note.is_favorite, updatedAt: note.updated_at, createdAt: note.created_at, content: note.content_html, attachments: attachmentsByNote.get(note.id) || [], palette: 0 }))
  };
}

async function uploadRemoteAttachment(client: AnySupabaseClient, user: User, noteId: string, file: File) {
  const storagePath = `${user.id}/${noteId}/${createUuid()}-${safeFileName(file.name)}`;
  const uploadResult = await client.storage.from("note-files").upload(storagePath, file, { upsert: false });
  if (uploadResult.error) throw uploadResult.error;
  const insertResult = await client.from("note_attachments").insert({ note_id: noteId, user_id: user.id, storage_path: storagePath, file_name: file.name, mime_type: file.type || "application/octet-stream", file_size: file.size }).select().single();
  if (insertResult.error) {
    await client.storage.from("note-files").remove([storagePath]);
    throw insertResult.error;
  }
  return { remoteId: insertResult.data.id as string, storagePath };
}

async function deleteRemoteNote(client: AnySupabaseClient, user: User, noteId: string) {
  const attachmentsResult = await client.from("note_attachments").select("storage_path").eq("note_id", noteId).eq("user_id", user.id);
  const paths = (attachmentsResult.data || []).map((attachment) => attachment.storage_path);
  if (paths.length) await client.storage.from("note-files").remove(paths);
  const result = await client.from("notes").delete().eq("id", noteId).eq("user_id", user.id);
  if (result.error) throw result.error;
}

async function deleteRemoteAttachment(client: AnySupabaseClient, user: User, attachment: Attachment) {
  if (attachment.storagePath) await client.storage.from("note-files").remove([attachment.storagePath]);
  if (attachment.remoteId) await client.from("note_attachments").delete().eq("id", attachment.remoteId).eq("user_id", user.id);
}

function formatAuthError(error: unknown) {
  const authError = error as { code?: string; message?: string } | null;
  const code = String(authError?.code || "").toLowerCase();
  const message = String(authError?.message || "").toLowerCase();
  if (code === "email_not_confirmed" || message.includes("email not confirmed")) return "Supabaseの「Confirm email」をオフにしてから、もう一度登録してください。";
  if (code === "invalid_credentials" || message.includes("invalid login credentials")) return "ユーザー名またはパスワードが違います。";
  if (code === "user_already_exists" || message.includes("already registered") || message.includes("already exists")) return "このユーザー名は登録済みです。ログインをお試しください。";
  if (message.includes("password should be at least") || message.includes("password must be at least")) return "パスワードは6文字以上で入力してください。";
  if (message.includes("rate limit") || message.includes("too many requests")) return "試行回数が多すぎます。少し時間をおいてからお試しください。";
  if (message.includes("failed to fetch") || message.includes("network")) return "Supabaseに接続できません。通信状態を確認してください。";
  return `認証に失敗しました。${authError?.message || "時間をおいて再度お試しください。"}`;
}

function formatCloudError(error: unknown) {
  const cloudError = error as { code?: string; message?: string; status?: number } | null;
  const code = String(cloudError?.code || "").toLowerCase();
  const message = String(cloudError?.message || "").toLowerCase();
  if (code === "42p01" || (message.includes("relation") && message.includes("does not exist"))) return "ログインは成功しましたが、Supabaseのテーブルが未作成です。supabase-schema.sqlをSQL Editorで実行してください。";
  if (cloudError?.status === 401 || cloudError?.status === 403) return "ログインは成功しましたが、SupabaseのRLS設定を確認してください。";
  return "クラウド同期に失敗しました。ローカルには保存されています。";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("ファイルを読み込めませんでした"));
    reader.readAsDataURL(file);
  });
}

export default function Page() {
  const [state, setState] = useState<MemoState>(() => cloneSeedState());
  const [localLoaded, setLocalLoaded] = useState(false);
  const [currentView, setCurrentView] = useState("home");
  const [currentFilter, setCurrentFilter] = useState<"folders" | "all">("folders");
  const [currentSort, setCurrentSort] = useState<"recent" | "oldest">("recent");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogSelectInEditor, setFolderDialogSelectInEditor] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderColorIndex, setFolderColorIndex] = useState(0);
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const [deleteDialogNoteId, setDeleteDialogNoteId] = useState<string | null>(null);
  const [toolbarVisible, setToolbarVisible] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ title: "保存済み", detail: "このブラウザに保存" });
  const [saveStatus, setSaveStatus] = useState("自動保存");
  const [toast, setToast] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const [supabaseClient, setSupabaseClient] = useState<AnySupabaseClient | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentUsername, setCurrentUsername] = useState("");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;
  const clientRef = useRef<AnySupabaseClient | null>(null);
  const currentUserRef = useRef<User | null>(null);
  const localLoadedRef = useRef(false);
  const hydratingRef = useRef(false);
  const skipCloudSyncRef = useRef(false);
  const cloudSyncTimerRef = useRef<number | null>(null);
  const remoteHydrateTimerRef = useRef<number | null>(null);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const hydrateRef = useRef<((client: AnySupabaseClient, user: User) => Promise<void>) | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const deletePreviousFocusRef = useRef<HTMLElement | null>(null);
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null);
  const editorContentRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((message: string, duration = 2600) => {
    setToast(message);
    setToastVisible(true);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastVisible(false), duration);
  }, []);

  const updateSyncStatus = useCallback((title: string, detail: string) => {
    setSyncStatus({ title, detail });
  }, []);

  useEffect(() => {
    setState(loadState());
    setLocalLoaded(true);
    localLoadedRef.current = true;
  }, []);

  useEffect(() => {
    if (localLoaded) persistLocalState(state);
  }, [localLoaded, state]);

  useEffect(() => {
    const theme = themes[state.theme] || themes.sage;
    const root = document.documentElement;
    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--accent-soft", theme.soft);
    root.style.setProperty("--accent-strong", theme.strong);
    root.style.setProperty("--accent-ink", theme.ink);
    root.style.setProperty("--line-strong", theme.line);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.soft);
  }, [state.theme]);

  const setupRealtime = useCallback((client: AnySupabaseClient, user: User, queueRemoteHydrate: (client: AnySupabaseClient) => void) => {
    if (realtimeChannelRef.current) void client.removeChannel(realtimeChannelRef.current);
    realtimeChannelRef.current = client.channel(`memo-sync-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "folders", filter: `user_id=eq.${user.id}` }, () => queueRemoteHydrate(client))
      .on("postgres_changes", { event: "*", schema: "public", table: "notes", filter: `user_id=eq.${user.id}` }, () => queueRemoteHydrate(client))
      .on("postgres_changes", { event: "*", schema: "public", table: "note_attachments", filter: `user_id=eq.${user.id}` }, () => queueRemoteHydrate(client))
      .subscribe();
  }, []);

  const queueRemoteHydrate = useCallback((client: AnySupabaseClient) => {
    if (hydratingRef.current) return;
    if (remoteHydrateTimerRef.current) window.clearTimeout(remoteHydrateTimerRef.current);
    remoteHydrateTimerRef.current = window.setTimeout(() => {
      const user = currentUserRef.current;
      if (user && hydrateRef.current) void hydrateRef.current(client, user);
    }, 400);
  }, []);

  const hydrateFromCloud = useCallback(async (client: AnySupabaseClient, user: User) => {
    if (hydratingRef.current) return;
    hydratingRef.current = true;
    updateSyncStatus("同期中…", "クラウドから読み込んでいます");
    try {
      const cloudState = await readCloudState(client, user, stateRef.current);
      if (!cloudState) {
        await syncStateToCloud(client, user, stateRef.current);
        setupRealtime(client, user, queueRemoteHydrate);
        updateSyncStatus("同期済み", "PC・スマホで共有中");
        return;
      }
      skipCloudSyncRef.current = true;
      setState(cloudState);
      setupRealtime(client, user, queueRemoteHydrate);
      updateSyncStatus("同期済み", "PC・スマホで共有中");
    } catch (error) {
      console.warn("Cloud hydrate failed", error);
      updateSyncStatus("同期エラー", "ローカルには保存済み");
      showToast(formatCloudError(error), 6000);
    } finally {
      hydratingRef.current = false;
    }
  }, [queueRemoteHydrate, setupRealtime, showToast, updateSyncStatus]);

  hydrateRef.current = hydrateFromCloud;

  useEffect(() => {
    if (!localLoaded || !supabaseClient || !currentUser || hydratingRef.current) return;
    if (skipCloudSyncRef.current) {
      skipCloudSyncRef.current = false;
      return;
    }
    updateSyncStatus("同期中…", "クラウドへ保存しています");
    if (cloudSyncTimerRef.current) window.clearTimeout(cloudSyncTimerRef.current);
    cloudSyncTimerRef.current = window.setTimeout(() => {
      const client = clientRef.current;
      const user = currentUserRef.current;
      if (!client || !user) return;
      void syncStateToCloud(client, user, stateRef.current)
        .then(() => updateSyncStatus("同期済み", "PC・スマホで共有中"))
        .catch((error) => {
          console.warn("Cloud sync failed", error);
          updateSyncStatus("同期エラー", "ローカルには保存済み");
        });
    }, 450);
    return () => {
      if (cloudSyncTimerRef.current) window.clearTimeout(cloudSyncTimerRef.current);
    };
  }, [currentUser, localLoaded, state, supabaseClient, updateSyncStatus]);

  useEffect(() => {
    if (!HAS_SUPABASE_CONFIG) {
      updateSyncStatus("保存済み", "このブラウザに保存");
      return;
    }
    let disposed = false;
    const client = getSupabaseClient();
    if (!client) return;
    clientRef.current = client;
    setSupabaseClient(client);
    const { data: listener } = client.auth.onAuthStateChange((event, session) => {
      if (disposed) return;
      const user = session?.user || null;
      currentUserRef.current = user;
      setCurrentUser(user);
      setCurrentUsername(user?.user_metadata?.username || "");
      if (user && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) void hydrateFromCloud(client, user);
      if (!user) {
        if (realtimeChannelRef.current) { void client.removeChannel(realtimeChannelRef.current); realtimeChannelRef.current = null; }
        updateSyncStatus("保存済み", "このブラウザに保存");
      }
    });
    void (async () => {
      try {
        const sessionResult = await client.auth.getSession();
        if (sessionResult.error) throw sessionResult.error;
        if (disposed) return;
        const user = sessionResult.data.session?.user || null;
        currentUserRef.current = user;
        setCurrentUser(user);
        setCurrentUsername(user?.user_metadata?.username || "");
        if (user) await hydrateFromCloud(client, user);
        else updateSyncStatus("ログイン待ち", "アカウントを設定してください");
      } catch (error) {
        console.warn("Supabase initialization failed", error);
        updateSyncStatus("保存済み", "このブラウザに保存");
      }
    })();
    return () => {
      disposed = true;
      listener.subscription.unsubscribe();
      if (realtimeChannelRef.current) { void client.removeChannel(realtimeChannelRef.current); realtimeChannelRef.current = null; }
      if (remoteHydrateTimerRef.current) window.clearTimeout(remoteHydrateTimerRef.current);
    };
  }, [hydrateFromCloud, updateSyncStatus]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const editor = editorContentRef.current;
      const selection = window.getSelection();
      const hasSelection = Boolean(editor && selection && selection.rangeCount > 0 && !selection.isCollapsed && editor.contains(selection.anchorNode) && editor.contains(selection.focusNode));
      setToolbarVisible(Boolean(activeNoteId && editorOpen && hasSelection));
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [activeNoteId, editorOpen]);

  useEffect(() => {
    const handleOutsideContext = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target?.closest(".note-context-menu, .note-more")) setContextMenu(null);
    };
    document.addEventListener("pointerdown", handleOutsideContext);
    return () => document.removeEventListener("pointerdown", handleOutsideContext);
  }, []);

  useEffect(() => {
    if (deleteDialogNoteId) deleteCancelRef.current?.focus();
  }, [deleteDialogNoteId]);

  useEffect(() => {
    if (!editorOpen || !activeNoteId || !editorContentRef.current) return;
    const activeNote = stateRef.current.notes.find((note) => note.id === activeNoteId);
    if (activeNote) editorContentRef.current.innerHTML = activeNote.content || "";
  }, [activeNoteId, editorOpen]);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !(location.protocol === "http:" || location.protocol === "https:")) return;
    let reloaded = false;
    const handleControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    navigator.serviceWorker.register("./sw.js").then((registration) => registration.update()).catch((error) => console.warn("Service worker registration failed", error));
    return () => navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); document.querySelector<HTMLInputElement>("#search-input")?.focus(); }
      if (event.key.toLowerCase() === "n" && document.activeElement?.tagName !== "INPUT" && document.activeElement?.getAttribute("contenteditable") !== "true") openEditor();
      if (event.key === "Escape") {
        if (deleteDialogNoteId) closeDeleteDialog();
        else if (folderDialogOpen) closeFolderDialog();
        else if (editorOpen) closeEditor();
        else if (settingsOpen) setSettingsOpen(false);
        else setContextMenu(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  const activeNote = useMemo(() => state.notes.find((note) => note.id === activeNoteId) || null, [activeNoteId, state.notes]);
  const activeFolder = currentView.startsWith("folder:") ? state.folders.find((folder) => folder.id === currentView.slice(7)) || null : null;

  const currentNotes = useMemo(() => {
    let notes = [...state.notes];
    if (currentView === "favorites") notes = notes.filter((note) => note.favorite);
    if (currentView.startsWith("folder:")) notes = notes.filter((note) => note.folderId === currentView.slice(7));
    if (currentView === "home" && currentFilter === "folders") notes = notes.filter((note) => !note.folderId);
    if (currentFilter === "all" || currentView.startsWith("folder:")) notes.sort((a, b) => currentSort === "oldest" ? new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime() : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      notes = notes.filter((note) => `${note.title} ${plainText(note.content)}`.toLowerCase().includes(query));
    }
    return notes;
  }, [currentFilter, currentSort, currentView, searchQuery, state.notes]);

  const pageTitle = currentView === "home" ? (currentFilter === "folders" ? "フォルダ" : "すべてのメモ") : currentView === "favorites" ? "お気に入り" : activeFolder?.name || "フォルダ";
  const pageDescription = currentView === "home" ? (currentFilter === "folders" ? "メモをテーマごとに整理したり、未分類のメモを確認できます。" : "すべてのメモを、最近使った順に並べています。") : currentView === "favorites" ? "大切なメモを、いつでもすぐに。" : `${activeFolder?.name || "このフォルダ"}に保存されているメモです。`;
  const isFolderHome = currentView === "home" && currentFilter === "folders";

  function updateNote(noteId: string, changes: Partial<Note>) {
    setState((previous) => ({ ...previous, notes: previous.notes.map((note) => note.id === noteId ? { ...note, ...changes } : note) }));
  }

  function openEditor(noteId?: string) {
    if (noteId) {
      if (!state.notes.some((note) => note.id === noteId)) return;
      setActiveNoteId(noteId);
    } else {
      const now = new Date().toISOString();
      const defaultFolderId = currentView.startsWith("folder:") && state.folders.some((folder) => folder.id === currentView.slice(7)) ? currentView.slice(7) : null;
      const note: Note = { id: createUuid(), title: "", folderId: defaultFolderId, favorite: false, updatedAt: now, content: "", attachments: [], palette: state.notes.length % notePalette.length };
      setState((previous) => ({ ...previous, notes: [note, ...previous.notes] }));
      setActiveNoteId(note.id);
    }
    setToolbarVisible(false);
    setEditorOpen(true);
  }

  function closeEditor() {
    setToolbarVisible(false);
    setEditorOpen(false);
    setActiveNoteId(null);
  }

  function openFolderDialog(selectInEditor = false) {
    setFolderDialogSelectInEditor(selectInEditor);
    setFolderName("");
    setFolderColorIndex(state.folders.length % folderPalette.length);
    setFolderDialogOpen(true);
  }

  function closeFolderDialog() {
    setFolderDialogOpen(false);
    setFolderDialogSelectInEditor(false);
  }

  function confirmFolderCreation() {
    const name = folderName.trim();
    if (!name) { showToast("フォルダ名を入力してください"); return; }
    const palette = folderPalette[folderColorIndex] || folderPalette[0];
    const folder: Folder = { id: createUuid(), name, ...palette, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setState((previous) => ({ ...previous, folders: [...previous.folders, folder] }));
    if (folderDialogSelectInEditor && activeNoteId) updateNote(activeNoteId, { folderId: folder.id, updatedAt: new Date().toISOString() });
    closeFolderDialog();
    showToast(`「${folder.name}」を作成しました`);
  }

  function openContextMenu(noteId: string, event: ReactMouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setContextMenu({ noteId, left: Math.min(window.innerWidth - 128, Math.max(8, rect.right - 120)), top: Math.min(window.innerHeight - 54, rect.bottom + 6) });
  }

  function requestDelete(noteId: string) {
    if (!state.notes.some((note) => note.id === noteId)) return;
    const focused = document.activeElement;
    deletePreviousFocusRef.current = focused instanceof HTMLElement && focused.closest(".note-context-menu") ? null : focused as HTMLElement | null;
    setContextMenu(null);
    setDeleteDialogNoteId(noteId);
  }

  function closeDeleteDialog() {
    setDeleteDialogNoteId(null);
    const previousFocus = deletePreviousFocusRef.current;
    deletePreviousFocusRef.current = null;
    window.setTimeout(() => previousFocus?.focus(), 0);
  }

  function confirmDeleteNote() {
    if (!deleteDialogNoteId) return;
    const noteId = deleteDialogNoteId;
    if (!state.notes.some((note) => note.id === noteId)) { closeDeleteDialog(); return; }
    setState((previous) => ({ ...previous, notes: previous.notes.filter((note) => note.id !== noteId) }));
    closeDeleteDialog();
    if (currentUser && supabaseClient) void deleteRemoteNote(supabaseClient, currentUser, noteId).catch((error) => { console.warn("Remote delete failed", error); updateSyncStatus("同期エラー", "削除を同期できません"); });
    if (activeNoteId === noteId) closeEditor();
    showToast("メモを削除しました");
  }

  async function loginWithPassword() {
    if (!supabaseClient) { showToast("Supabaseの接続設定が必要です"); return; }
    const username = normalizeUsername(authUsername);
    if (!isValidUsername(username) || authPassword.length < 6) { showToast("ユーザー名は3〜30文字、パスワードは6文字以上で入力してください"); return; }
    setAuthBusy(true);
    try {
      const { error } = await supabaseClient.auth.signInWithPassword({ email: usernameToInternalEmail(username), password: authPassword });
      if (error) showToast(formatAuthError(error), 5000);
      else showToast("ログインしました");
    } catch (error) {
      showToast(formatAuthError(error), 5000);
    } finally {
      setAuthBusy(false);
    }
  }

  async function signUp() {
    if (!supabaseClient) { showToast("Supabaseの接続設定が必要です"); return; }
    const username = normalizeUsername(authUsername);
    if (!isValidUsername(username) || authPassword.length < 6) { showToast("ユーザー名は3〜30文字、パスワードは6文字以上で入力してください"); return; }
    setAuthBusy(true);
    try {
      const { data, error } = await supabaseClient.auth.signUp({ email: usernameToInternalEmail(username), password: authPassword, options: { data: { username } } });
      if (error) { showToast(formatAuthError(error), 5000); return; }
      if (data.session) {
        setCurrentUsername(username);
        showToast("アカウントを作成しました");
      } else {
        setAuthPassword("");
        showToast("登録できませんでした。Supabaseの「Confirm email」をオフにしてください。", 6000);
      }
    } catch (error) {
      showToast(formatAuthError(error), 5000);
    } finally {
      setAuthBusy(false);
    }
  }

  async function logout() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    currentUserRef.current = null;
    setCurrentUser(null);
    setCurrentUsername("");
    updateSyncStatus("保存済み", "このブラウザに保存");
    showToast("ログアウトしました");
  }

  function executeFormat(command: string, value?: string) {
    const editor = editorContentRef.current;
    if (!editor || !activeNoteId) return;
    editor.focus();
    if (command === "formatBlock") document.execCommand(command, false, `<${value}>`);
    else if (command === "foreColor") document.execCommand(command, false, themes[state.theme].strong);
    else document.execCommand(command, false, value || "");
    updateNote(activeNoteId, { content: editor.innerHTML, updatedAt: new Date().toISOString() });
    setSaveStatus("保存済み");
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const noteId = activeNoteId;
    const client = supabaseClient;
    const user = currentUser;
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!noteId || !files.length) return;
    for (const file of files) {
      const localId = createUuid();
      const attachment: Attachment = { localId, name: file.name, size: formatFileSize(file.size), type: file.type, ...(file.type.startsWith("image/") ? { dataUrl: await readFileAsDataUrl(file) } : {}) };
      setState((previous) => ({ ...previous, notes: previous.notes.map((note) => note.id === noteId ? { ...note, attachments: [...note.attachments, attachment] } : note) }));
      if (client && user) {
        try {
          const remote = await uploadRemoteAttachment(client, user, noteId, file);
          setState((previous) => ({ ...previous, notes: previous.notes.map((note) => note.id === noteId ? { ...note, attachments: note.attachments.map((item) => item.localId === localId ? { ...item, ...remote } : item) } : note) }));
          updateSyncStatus("同期済み", "添付ファイルも保存済み");
        } catch (error) {
          console.warn("Remote attachment upload failed", error);
          updateSyncStatus("同期エラー", "添付ファイルを保存できません");
        }
      }
    }
  }

  function removeAttachment(index: number) {
    if (!activeNote) return;
    const removed = activeNote.attachments[index];
    updateNote(activeNote.id, { attachments: activeNote.attachments.filter((_, attachmentIndex) => attachmentIndex !== index), updatedAt: new Date().toISOString() });
    if (removed && supabaseClient && currentUser) void deleteRemoteAttachment(supabaseClient, currentUser, removed).catch((error) => console.warn("Remote attachment delete failed", error));
  }

  function setView(view: string) {
    setCurrentView(view);
    setCurrentFilter(view === "home" ? "folders" : "all");
    setContextMenu(null);
  }

  const displayedUsername = currentUsername || currentUser?.user_metadata?.username || "ログイン中";
  const avatarLabel = displayedUsername === "ログイン中" ? "YN" : displayedUsername.slice(0, 2).toUpperCase();
  const authConfigured = Boolean(supabaseClient);
  const signedOutHint = authConfigured ? "ユーザー名とパスワードで登録・ログインできます。" : "Supabaseの接続設定後に利用できます。";

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="メインメニュー">
        <div className="brand-lockup"><div className="brand-mark" aria-hidden="true">✦</div><div><div className="brand-name">memo</div><div className="brand-caption">your quiet space</div></div></div>
        <div className="sidebar-block"><div className="sidebar-label">WORKSPACE</div><nav className="primary-nav">
          <button className={`nav-item ${currentView === "home" ? "is-active" : ""}`} onClick={() => setView("home")} type="button"><span className="nav-icon icon-grid" aria-hidden="true" /><span>すべてのメモ</span><span className="nav-count">{state.notes.length}</span></button>
          <button className={`nav-item ${currentView === "favorites" ? "is-active" : ""}`} onClick={() => setView("favorites")} type="button"><span className="nav-icon icon-star" aria-hidden="true">☆</span><span>お気に入り</span><span className="nav-count">{state.notes.filter((note) => note.favorite).length}</span></button>
        </nav></div>
        <div className="sidebar-block folder-sidebar-block"><div className="sidebar-heading"><div className="sidebar-label">FOLDERS</div><button className="mini-action" onClick={() => openFolderDialog()} type="button" aria-label="フォルダを追加">＋</button></div><nav className="folder-nav">
          {state.folders.map((folder) => <button className={`nav-item ${currentView === `folder:${folder.id}` ? "is-active" : ""}`} key={folder.id} onClick={() => setView(`folder:${folder.id}`)} type="button"><span className="folder-icon" style={{ color: folder.color }} /><span>{folder.name}</span><span className="nav-count">{state.notes.filter((note) => note.folderId === folder.id).length}</span></button>)}
        </nav></div>
        <div className="sidebar-bottom"><button className="new-note-button" onClick={() => openEditor()} type="button"><span className="new-note-plus" aria-hidden="true">＋</span><span>新しいメモ</span><span className="shortcut">N</span></button><button className="settings-button" onClick={() => setSettingsOpen(true)} type="button"><span className="nav-icon icon-settings" aria-hidden="true" /><span>設定</span></button><div className="sync-indicator"><span className="sync-dot" /><span><strong>{syncStatus.title}</strong><small>{syncStatus.detail}</small></span></div></div>
      </aside>

      <main className="main-content">
        <header className="topbar"><div className="breadcrumb"><span className="breadcrumb-home">memo</span><span className="breadcrumb-separator">/</span><span>{pageTitle}</span></div><div className="topbar-actions"><label className="search-box"><span className="search-icon" aria-hidden="true" /><input id="search-input" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="メモを検索" aria-label="メモを検索" /><span className="search-shortcut">⌘ K</span></label><button className="avatar-button" onClick={() => setSettingsOpen(true)} type="button" aria-label="プロフィール">{avatarLabel}</button></div></header>
        <div className="page-content">
          <section className="welcome-row"><div><div className="eyebrow">THURSDAY, SEP 02, 2026</div><h1>{pageTitle}</h1><p>{pageDescription}</p></div><button className="primary-add-button" onClick={() => openEditor()} type="button"><span>＋</span> メモを追加</button></section>
          <div className="view-toolbar"><div className="view-tabs" role="tablist" aria-label="メモの表示"><button className={`view-tab ${currentFilter === "folders" ? "is-active" : ""}`} onClick={() => setCurrentFilter("folders")} type="button">フォルダ</button><button className={`view-tab ${currentFilter === "all" ? "is-active" : ""}`} onClick={() => setCurrentFilter("all")} type="button">すべてのメモ <span>{currentView === "favorites" ? state.notes.filter((note) => note.favorite).length : state.notes.length}</span></button></div><div className="toolbar-note">自動保存オン <span className="tiny-check">✓</span></div></div>

          {isFolderHome && <section className="content-section folder-section"><div className="section-heading"><div><h2>フォルダ</h2><span className="section-subtitle">テーマごとにまとめておく</span></div><button className="text-action" onClick={() => openFolderDialog()} type="button">＋ フォルダを追加</button></div><div className="folder-grid">
            {state.folders.length ? state.folders.map((folder) => <button className="folder-card" key={folder.id} onClick={() => setView(`folder:${folder.id}`)} type="button" style={{ "--folder-color": folder.color, "--folder-soft": folder.soft } as CSSProperties}><div className="folder-card-top"><span className="folder-card-icon">▰</span></div><h3>{folder.name}</h3><p>{state.notes.filter((note) => note.folderId === folder.id).length}件のメモ</p></button>) : <div className="folder-empty-state"><div className="folder-empty-illustration" aria-hidden="true"><span /><i /></div><div><strong>フォルダがありません</strong><p>メモをテーマごとに整理したくなったら、ここから作成できます。</p></div><button className="folder-empty-action" onClick={() => openFolderDialog()} type="button">＋ フォルダを作成</button></div>}
          </div></section>}

          <section className="content-section notes-section"><div className="section-heading"><div className="notes-heading-label"><h2>{currentView === "favorites" ? "お気に入り" : currentView.startsWith("folder:") ? `${activeFolder?.name || "フォルダ"}のメモ` : currentFilter === "folders" ? "未分類のメモ" : "すべてのメモ"}</h2><span className="section-number">{currentNotes.length}</span></div><div className="display-controls"><label className="sort-control" hidden={currentView !== "home" || currentFilter !== "all"}>並び替え<select value={currentSort} onChange={(event) => setCurrentSort(event.target.value as "recent" | "oldest")} aria-label="メモの並び替え"><option value="recent">最近使った順</option><option value="oldest">古い順</option></select></label><button className="icon-button is-selected" type="button" aria-label="カード表示"><span className="card-view-icon" /></button><button className="icon-button" type="button" aria-label="リスト表示"><span className="list-view-icon" /></button></div></div>
            <div className="notes-grid">{currentNotes.map((note) => { const folder = state.folders.find((item) => item.id === note.folderId); const palette = folder ? { color: folder.color, soft: folder.soft, ink: folder.ink } : { color: "#d6c4e8", soft: "#f5effa", ink: "#81639f" }; const image = note.attachments.find((attachment) => attachment.type.startsWith("image/") && (attachment.dataUrl || attachment.signedUrl)); const cardStyle = { "--note-color": palette.color, "--note-soft": palette.soft, "--note-ink": palette.ink } as CSSProperties; return <article className={`note-card ${image ? "is-image" : ""}`} key={note.id} onClick={() => openEditor(note.id)} style={cardStyle}><>{image && <div className="note-cover image-cover"><img src={image.dataUrl || image.signedUrl} alt="" /></div>}</><div className="note-card-top"><span className="note-folder-label"><i className="mini-folder-icon" />{folder?.name || "未分類"}</span><button className="note-more" onClick={(event) => openContextMenu(note.id, event)} type="button" aria-label="その他">···</button></div><h3>{note.title || "無題のメモ"}</h3><div className="note-preview">{plainText(note.content) || "内容を追加しましょう"}</div><div className="note-card-bottom"><span className="note-date">{formatDate(note.updatedAt)}に編集</span>{note.attachments.length > 0 && <span className="attachment-count"><span className="paperclip">⌕</span>{note.attachments.length}</span>}</div></article>; })}</div>
            {!currentNotes.length && <div className="empty-state"><div className="empty-illustration">✎</div><h3>{currentFilter === "folders" ? "未分類のメモはありません" : "まだメモがありません"}</h3><p>{currentFilter === "folders" ? "フォルダに入れていないメモはここに表示されます。" : "思いついたことを、最初のメモに残してみましょう。"}</p><button className="primary-add-button" onClick={() => openEditor()} type="button"><span>＋</span> メモを追加</button></div>}
          </section>
        </div>
        <footer className="mobile-footer"><button className="mobile-footer-item" onClick={() => setView("home")} type="button"><span className="nav-icon icon-grid" /><small>ホーム</small></button><button className="mobile-footer-add" onClick={() => openEditor()} id="mobile-add-button" type="button" aria-label="新しいメモ">＋</button><button className="mobile-footer-item" onClick={() => setSettingsOpen(true)} type="button"><span className="nav-icon icon-settings" /><small>設定</small></button></footer>
      </main>

      {editorOpen && activeNote && <><div className="modal-backdrop" onClick={closeEditor} /><section className="editor-panel is-open" aria-label="メモを編集" aria-modal="true"><div className="editor-header"><button className="close-button" onClick={closeEditor} type="button" aria-label="閉じる">×</button><div className="editor-status"><span className="editor-status-dot" /><span>{saveStatus}</span></div><div className="editor-header-actions"><button className={`editor-icon-action ${activeNote.favorite ? "is-favorite" : ""}`} onClick={() => updateNote(activeNote.id, { favorite: !activeNote.favorite, updatedAt: new Date().toISOString() })} type="button" aria-label="お気に入りに追加">{activeNote.favorite ? "★" : "☆"}</button></div></div><div className="editor-scroll"><div className="editor-meta-line"><span className="editor-note-label">NOTE</span><span className="editor-updated">{activeNote.createdAt ? `${formatDate(activeNote.updatedAt)}に編集` : "新規メモ"}</span><button className="delete-note-button" onClick={() => requestDelete(activeNote.id)} type="button">削除</button></div><input className="editor-title" value={activeNote.title} onChange={(event) => { updateNote(activeNote.id, { title: event.target.value, updatedAt: new Date().toISOString() }); setSaveStatus("保存済み"); }} type="text" placeholder="タイトルを入力" aria-label="メモのタイトル" /><div className="editor-folder-row"><span className="folder-pin-icon" aria-hidden="true">⌑</span><label htmlFor="editor-folder">フォルダ</label><select id="editor-folder" value={activeNote.folderId || ""} onChange={(event) => updateNote(activeNote.id, { folderId: event.target.value || null, updatedAt: new Date().toISOString() })} aria-label="保存先フォルダ"><option value="">未分類</option>{state.folders.map((folder) => <option value={folder.id} key={folder.id}>{folder.name}</option>)}</select><button className="inline-folder-button" onClick={() => openFolderDialog(true)} type="button">＋ フォルダを作成</button></div><div className={`editor-toolbar ${toolbarVisible ? "is-visible" : ""}`} role="toolbar" aria-label="書式設定" onMouseDown={(event) => event.preventDefault()}><button onClick={() => executeFormat("formatBlock", "p")} type="button" aria-label="本文">本文</button><button onClick={() => executeFormat("formatBlock", "h2")} type="button" aria-label="見出し">H1</button><span className="toolbar-divider" /><button onClick={() => executeFormat("bold")} type="button" className="format-button" aria-label="太字"><strong>B</strong></button><button onClick={() => executeFormat("italic")} type="button" className="format-button" aria-label="斜体"><em>I</em></button><button onClick={() => executeFormat("underline")} type="button" className="format-button" aria-label="下線"><u>U</u></button><button onClick={() => executeFormat("insertUnorderedList")} type="button" className="format-button list-format" aria-label="箇条書き">•</button><span className="toolbar-divider" /><button onClick={() => executeFormat("foreColor")} type="button" className="color-format" aria-label="文字色"><span>A</span></button><button onClick={() => executeFormat("hiliteColor", "#fff0b2")} type="button" className="highlight-format" aria-label="マーカー"><span /></button><button onClick={() => { const url = window.prompt("リンク先URLを入力してください", "https://"); if (url) executeFormat("createLink", url); }} type="button" className="format-button" aria-label="リンク">↗</button></div><div ref={editorContentRef} className="editor-content" contentEditable suppressContentEditableWarning data-placeholder="ここにメモを書き始める…" onInput={(event) => { updateNote(activeNote.id, { content: event.currentTarget.innerHTML, updatedAt: new Date().toISOString() }); setSaveStatus("保存中…"); }} onMouseUp={() => setToolbarVisible(true)} onKeyUp={() => setToolbarVisible(true)} /><div className="editor-attachments">{activeNote.attachments.map((attachment, index) => <div className="attachment-item" key={attachment.localId || attachment.remoteId || `${attachment.name}-${index}`}>{(attachment.dataUrl || attachment.signedUrl) ? <img className="attachment-thumb" src={attachment.dataUrl || attachment.signedUrl} alt="" /> : <span className="attachment-file-icon">⌁</span>}<span><strong>{attachment.name}</strong><small>{attachment.size || "ファイル"}</small></span><button className="remove-attachment" onClick={() => removeAttachment(index)} type="button" aria-label="添付を削除">×</button></div>)}</div><label className="attachment-dropzone" htmlFor="file-input"><span className="attachment-plus">＋</span><span><strong>ファイルを追加</strong><small>画像、PDF、その他のファイル</small></span><input ref={fileInputRef} id="file-input" onChange={handleFiles} type="file" multiple /></label></div><div className="editor-bottom-bar"><button className="editor-done-button" onClick={closeEditor} type="button">完了</button></div></section></>}

      {settingsOpen && <><div className="modal-backdrop" onClick={() => setSettingsOpen(false)} /><section className="settings-panel is-open" aria-label="設定" aria-modal="true"><div className="settings-header"><div><div className="eyebrow">PREFERENCES</div><h2>設定</h2></div><button className="close-button" onClick={() => setSettingsOpen(false)} type="button" aria-label="閉じる">×</button></div><div className="settings-content"><section className="settings-section"><div className="settings-section-title"><div><h3>アクセントカラー</h3><p>あなたの気分に合わせて色を選べます。</p></div><span className="settings-preview-dot" /></div><div className="theme-grid">{(Object.entries(themes) as [ThemeName, Theme][]).map(([name, theme]) => <button className={`theme-option ${state.theme === name ? "is-selected" : ""}`} onClick={() => setState((previous) => ({ ...previous, theme: name }))} key={name} type="button"><span className="theme-swatch" style={{ background: theme.accent }} /><span>{theme.label}</span><i>✓</i></button>)}</div></section><section className="settings-section cloud-sync-section"><div className="settings-section-title"><div><h3>クラウド同期</h3><p>同じアカウントでPCとスマホを同期します。</p></div><span className="cloud-sync-icon">↗</span></div>{currentUser ? <div className="auth-state signed-in"><div className="signed-in-user"><span className="signed-in-avatar">{avatarLabel}</span><span><strong>{displayedUsername}</strong><small>このアカウントに同期しています</small></span></div><button className="auth-secondary-button" onClick={() => void logout()} type="button">ログアウト</button></div> : <div className="auth-state signed-out"><label htmlFor="auth-username">ユーザー名</label><input id="auth-username" value={authUsername} onChange={(event) => setAuthUsername(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loginWithPassword(); }} type="text" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="3〜30文字" disabled={!authConfigured || authBusy} /><label htmlFor="auth-password">パスワード</label><input id="auth-password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loginWithPassword(); }} type="password" autoComplete="current-password" placeholder="6文字以上" disabled={!authConfigured || authBusy} /><div className="auth-actions"><button className="auth-secondary-button" onClick={() => void signUp()} disabled={!authConfigured || authBusy} type="button">{authBusy ? "処理中…" : "新規登録"}</button><button className="auth-primary-button" onClick={() => void loginWithPassword()} disabled={!authConfigured || authBusy} type="button">ログイン</button></div><small>{signedOutHint}</small></div>}</section><section className="settings-section settings-list-section"><div className="setting-row"><span><strong>自動保存</strong><small>入力内容をすぐに保存します</small></span><span className="toggle is-on"><i /></span></div><div className="setting-row"><span><strong>同期ステータス</strong><small>{currentUser ? syncStatus.detail : "ログインするとPC・スマホで共有できます"}</small></span><span className="sync-badge"><i /><span>{syncStatus.title}</span></span></div></section><section className="settings-section about-section"><span className="about-mark">✦</span><div><strong>memo</strong><p>あなたの考えを、軽やかに。</p></div><span className="version">v1.0</span></section></div></section></>}

      {folderDialogOpen && <><div className="modal-backdrop" onClick={closeFolderDialog} /><section className="folder-dialog is-open" aria-label="フォルダを作成" aria-modal="true"><div className="folder-dialog-header"><div><div className="eyebrow">NEW FOLDER</div><h2>フォルダを作成</h2></div><button className="close-button" onClick={closeFolderDialog} type="button" aria-label="閉じる">×</button></div><div className="folder-dialog-content"><label className="folder-name-field" htmlFor="folder-name-input"><span>フォルダ名</span><input id="folder-name-input" value={folderName} onChange={(event) => setFolderName(event.target.value)} autoFocus type="text" placeholder="例：仕事、アイデア" maxLength={30} /></label><div className="folder-color-field"><span>カラー</span><div className="folder-color-options">{folderPalette.map((palette, index) => <button className={`folder-color-option ${folderColorIndex === index ? "is-selected" : ""}`} onClick={() => setFolderColorIndex(index)} key={palette.color} type="button" aria-label={`カラー${index + 1}`} style={{ "--folder-color": palette.color } as CSSProperties} />)}</div></div></div><div className="folder-dialog-actions"><button className="secondary-dialog-button" onClick={closeFolderDialog} type="button">キャンセル</button><button className="primary-dialog-button" onClick={confirmFolderCreation} type="button">作成する</button></div></section></>}

      {contextMenu && <div className="note-context-menu" style={{ left: contextMenu.left, top: contextMenu.top }}><button onClick={() => requestDelete(contextMenu.noteId)} type="button"><span>⌫</span>削除</button></div>}

      {deleteDialogNoteId && <><div className="modal-backdrop delete-dialog-backdrop" onClick={closeDeleteDialog} /><section className="delete-dialog is-open" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title" aria-describedby="delete-dialog-message"><div className="delete-dialog-content"><div className="delete-dialog-icon" aria-hidden="true">!</div><div><div className="eyebrow">DELETE NOTE</div><h2 id="delete-dialog-title">メモを削除しますか？</h2><p id="delete-dialog-message">「{state.notes.find((note) => note.id === deleteDialogNoteId)?.title || "無題のメモ"}」を削除すると、元に戻せません。</p></div></div><div className="delete-dialog-actions"><button className="secondary-dialog-button" ref={deleteCancelRef} onClick={closeDeleteDialog} type="button">キャンセル</button><button className="danger-dialog-button" onClick={confirmDeleteNote} type="button">削除する</button></div></section></>}

      <div className={`toast ${toastVisible ? "is-visible" : ""}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}
