# memo

Next.js（App Router）＋TypeScriptで作った、白基調のPWAメモ帳です。PCとスマホで同じUIを使えます。

## できること

- 「フォルダ」タブでフォルダ一覧と未分類メモを表示
- 「すべてのメモ」タブで最近使った順／古い順に並び替え
- 2:3の横向きカード表示、検索、お気に入り
- 見出し・太字・斜体・下線・箇条書き・文字色・マーカー・リンク
- 画像やファイルの添付
- アクセントカラーの変更
- ユーザー名＋パスワードのログイン
- Supabase Database／Storage／Realtime同期
- localStorageによる未ログイン時の自動保存
- PWA・Service Worker対応

## ローカル起動

```bash
npm install
npm run dev
```

`http://localhost:3000` を開いてください。

本番用の静的出力は次で作成できます。

```bash
npm run build
```

生成された`out`フォルダを静的ホスティングへ公開できます。

## Supabase設定

`supabase-config.js`にSupabaseのURLとPublishable key（旧anon key）を入力します。`service_role` keyはブラウザへ置かないでください。Next.jsのビルド時にこの設定を読み取り、クライアントへ公開用環境変数として渡します。

Supabase Dashboardでは次を設定してください。

- `Authentication > Providers > Email`：Email providerはON
- `Confirm email`：OFF

画面にはメールアドレスを表示しませんが、Supabase内部ではユーザー名から生成した内部識別子をメール形式として利用します。

その後、[supabase-schema.sql](./supabase-schema.sql)をSQL Editorで実行してください。ユーザー名を保存する`profiles`テーブルと登録時のトリガーもこのSQLに含まれます。

以前のメールアドレス方式で作成したアカウントは、ユーザー名方式へ自動変換されません。新しいユーザー名で登録してください。

## GitHub Pages公開

このリポジトリには`.github/workflows/deploy-pages.yml`を含めています。GitHubリポジトリの`Settings > Pages > Build and deployment > Source`を`GitHub Actions`に変更し、`main`へプッシュすると自動でビルド・公開されます。

リポジトリ名が`memo-app`の場合、公開URLは通常次の形式です。

`https://daiki-iha-k24c.github.io/memo-app/`

GitHub Actionsではリポジトリ用の`/memo-app`パスを自動設定します。ローカル開発時はルートパスで動作します。

## PWAとして利用

公開URLをスマホで開き、「ホーム画面に追加」または「インストール」を選択してください。Service Workerが更新を検知すると、次回表示時に新しいアプリへ切り替わります。
