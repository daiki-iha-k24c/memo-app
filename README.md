# memo

白基調のレスポンシブなメモ帳UIです。依存なしで動くため、`index.html` を開くだけでも確認できます。

## できること

- 「フォルダ」タブでのフォルダ一覧・未分類メモ表示
- 「すべてのメモ」タブでの全メモ表示と、最近使った順／古い順の並び替え
- 2:3のカード表示、検索、お気に入り
- タイトル・見出し・太字・斜体・下線・箇条書き・文字色・マーカー
- 画像やファイルの添付
- セージ／コーラル／アプリコット／バター／スカイ／ラベンダーのテーマ変更
- `localStorage` を使った自動保存
- スマホ向けのフッターナビとPWAマニフェスト
- Service Workerによるオフライン起動
- Supabase Authでのログイン、Database／Storage／Realtime同期

## 起動

Node.js がある場合は、このフォルダで次を実行します。

```bash
node -e "const http=require('http'),fs=require('fs'),path=require('path'); http.createServer((req,res)=>{const f=path.join(process.cwd(),req.url==='/'?'index.html':req.url);fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();}else{res.writeHead(200);res.end(d);}})}).listen(4173)"
```

その後 `http://localhost:4173` を開きます。

## Supabase接続

先にSupabase SQL EditorでテーブルとRLSのSQLを実行し、`supabase-config.js` の `url` と `publishableKey` を入力してください。ブラウザに置いてよいのはPublishable key（旧anon key）だけです。`service_role` keyは入力しないでください。

Supabase Dashboardの `Authentication > Providers > Email` で、次のように設定してください。

- Email provider: ON
- Confirm email: OFF

画面ではメールアドレスを使いませんが、Supabase内部ではユーザー名から生成した非公開の識別子をメール形式として利用します。アプリの「設定」からユーザー名とパスワードで新規登録・ログインしてください。ログインするとメモとフォルダがクラウドへ保存されます。既存のローカルデータは、クラウド側が空の最初のログイン時に移行されます。

以前のメールアドレス方式で作成したアカウントは、ユーザー名方式へ自動変換されません。必要であれば新しいユーザー名でアカウントを作成してください。

## スマホにPWAとして追加

PWAのインストールにはHTTPSでの公開が必要です（`localhost` は開発用の例外です）。Netlify、Vercel、Cloudflare Pages、GitHub Pagesなどに、このフォルダ内のファイルをそのまま公開してください。公開URLをスマホのChrome／Safariで開き、「ホーム画面に追加」または「インストール」を選ぶとアプリとして使えます。

## 同期について

ログイン中はSupabase Database／Storage／Realtimeを使って、PCとスマホのメモ・フォルダ・添付ファイルを同期します。未ログイン時はブラウザ内に保存されます。
