 # ADX Download - 舞萌 DX 谱面下载站

 一个基于 Node.js 的舞萌 DX / 初代舞萌谱面文件下载站。
 将谱面文件放入对应的版本文件夹，即可自动生成浏览和下载页面。

 ## 本地运行

 ```bash
 node server.js
 ```

 或双击 `start.bat`，然后访问 http://localhost:3000

 ## 支持版本

 涵盖 DX 时代（PRiSM / BUDDiES / FESTiVAL / UNiVERSE / Splash 等）和
 初代街机时代（MURDER / PiNK / ORANGE / GreeN / MiLK / maimai 等），
 共 26 个版本。

 ## 目录结构

 ```
 files/          # 谱面文件（.zip / .adx），按版本文件夹存放
 data/           # 版本元数据
 public/         # 前端页面（HTML / CSS / JS）
 scripts/        # 辅助工具脚本
 ```

 ## 部署

 支持 Railway、Render、Fly.io 等 Node.js 托管平台。
 部署后 `files/` 目录需要手动上传谱面文件。

 ## License

 MIT
