# ADX Download - 舞萌 DX 谱面下载站

一个基于 Node.js 的舞萌 DX / 初代舞萌谱面文件下载站。
将谱面文件放入对应的版本文件夹，即可自动生成浏览和下载页面。

## 架构

本项目支持两种模式：

- **本地模式**：谱面文件存储在服务器本地 iles/ 目录，由 Node.js 直接提供下载。
- **NAS / 远程模式**：设置 EXTERNAL_DOWNLOAD_URL 环境变量后，下载请求自动 302 重定向到远程存储（如 NAS、WebDAV、对象存储等）；Web 界面仍由 Node.js 提供，歌曲列表从 maidata.json 元数据文件生成。

## 本地运行

`ash
node server.js
`

或双击 start.bat，然后访问 http://localhost:3000

## 支持版本

涵盖 DX 时代（PRiSM / BUDDiES / FESTiVAL / UNiVERSE / Splash 等）和
初代街机时代（MURDER / PiNK / ORANGE / GreeN / MiLK / maimai 等），
共 26 个版本。

## 目录结构

`
files/          # 谱面文件（.zip / .adx），按版本文件夹存放
data/           # 版本元数据（versions.json 版本清单）
public/         # 前端页面（HTML / CSS / JS）
scripts/        # 辅助工具脚本（生成元数据等）
`

## 元数据生成

在本地有谱面文件时，运行以下脚本生成 maidata.json 缓存：

`ash
python scripts/generate_metadata.py
`

生成的 maidata.json 会写入每个版本文件夹内，可提交到 Git 仓库供 NAS 远程模式部署使用。

## 部署

### Railway 一键部署（推荐）

1. 在 [Railway Dashboard](https://railway.app/dashboard) 创建项目，关联 GitHub 仓库 yaoge2012/adxdown
2. 在项目 Variables 中设置环境变量：
   - EXTERNAL_DOWNLOAD_URL=https://wm.yaoge.fun/public — 下载重定向到 NAS
   - PORT（可选，Railway 会自动分配）
3. 部署自动触发，Railway 自动检测 Node.js 并运行 
pm start
4. 部署成功后 Railway 会分配一个 *.railway.app 域名

### 谱面元数据

部署前确保已提交 iles/*/maidata.json 元数据文件（已在 .gitignore 中排除二进制谱面文件）。
元数据可通过本地运行 python scripts/generate_metadata.py 生成。

### 其他平台

支持 Render、Fly.io 等任意 Node.js 托管平台，同样设置 EXTERNAL_DOWNLOAD_URL 环境变量即可。

## License

MIT