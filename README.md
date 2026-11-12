# Video Comparison

一个可持续扩展的 GitHub Pages 视频对比站。每个实验都位于独立的 `experiments/<slug>/` 目录，不会覆盖其他实验。

## 本地预览

不要直接双击 HTML。请在仓库根目录启动静态服务器：

```bash
python3 -m http.server 8000
```

然后访问 <http://localhost:8000/>。

## 新增实验

复制 `scripts/experiment-spec.example.json` 到仓库外部，填写实验信息和左右视频的绝对路径，再运行：

```bash
python3 scripts/create_experiment.py --spec /private/path/experiment.json
```

生成器会：

- 要求唯一、URL 安全的 `slug`；
- 使用 ffprobe 校验时长、帧率和视频规格；
- 原样复制 MP4，不转码；
- 为实验生成独立页面、清单和视频目录；
- 更新首页的实验目录；
- 默认拒绝覆盖同名实验。

只有明确更新已有实验时才使用：

```bash
python3 scripts/create_experiment.py --spec /private/path/experiment.json --update
```

更新前的目录会移动到被 Git 忽略的 `.comparison-backups/`，方便恢复。

## GitHub Pages

仓库使用 `main` 分支根目录发布。公开地址为：

```text
https://pinpin1027.github.io/video-comparison/
```

当前方案把 MP4 直接存入仓库，适合少量、单文件小于 100 MB 的视频。实验数量增多后，应把媒体迁移到自己控制的对象存储（例如 Cloudflare R2），网页结构不需要改变。
