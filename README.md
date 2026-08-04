<div align="center">

# Firefly Markdown

**一款纯前端、零依赖、离线可用的静态博客 Markdown 博文生成器**

专为 [Astro-Firefly](https://github.com/CuteLeaf/Firefly) 主题设计 · 可视化填写文章信息 · 一键生成标准 YAML FrontMatter 博客文章

简体中文 &nbsp;|&nbsp; 无后端 &nbsp;|&nbsp; 无需构建 &nbsp;|&nbsp; 本地离线

</div>

---

## 📦 项目介绍

Firefly-Markdown 是一款**纯原生前端、零第三方依赖**的 Markdown 博客编辑器。

解决静态博客写作痛点：手动写 FrontMatter 繁琐、参数记不住、格式容易报错。
可视化表单填写、实时预览、自动转义、一键导出标准博客 MD 文件。

**使用方式：下载三个文件放在同一目录，双击 `index.html` 即可。** 不需要 Node、不需要构建、不需要联网。

---

## 🌟 核心亮点

| 特性 | 说明 |
| --- | --- |
| **零依赖** | 无框架、无构建、无后端、无 CDN，打开即用 |
| **离线可用** | 本地双击 HTML 即可使用，断网完全正常 |
| **全可视化** | 所有博客参数表单化配置，无需手写 YAML |
| **自动容错** | 标题、描述自动转义引号 / 冒号，避免博客解析报错 |
| **持久缓存** | 自动保存编辑内容，刷新不丢失；内置多文档库 |
| **双主题** | 浅色 / 深色 / 跟随系统，一键切换 |
| **响应式** | 桌面三栏 · 平板双栏 + 抽屉 · 手机单栏 + 底部导航 |

---

## ✅ 完整博客 FrontMatter 支持

自动生成 Firefly 主题的全部字段：

| 属性 | 类型 | 必填 | 说明 |
| --- | --- | :---: | --- |
| `title` | string | 是 | 文章标题 |
| `published` | date | 是 | 发布日期 |
| `updated` | date | 否 | 更新日期，未设置则默认使用发布日期 |
| `description` | string | 否 | 文章简短描述，显示在首页文章卡片上 |
| `image` | string | 否 | 封面图片路径；随机图接口支持 `?id` 后缀让每篇文章加载不同封面 |
| `tags` | string[] | 否 | 文章标签 |
| `category` | string | 否 | 文章分类 |
| `draft` | boolean | 否 | 是否为草稿，草稿不会对读者可见 |
| `pinned` | boolean | 否 | 是否置顶在文章列表顶部 |
| `slug` | string | 否 | 自定义 URL 路径 |
| `lang` | string | 否 | 文章语言代码（如 `zh-CN`），仅当与站点默认语言不同时设置 |
| `author` | string | 否 | 文章作者 |
| `comment` | boolean | 否 | 是否启用评论，默认 `true` |
| `licenseName` | string | 否 | 自定义许可证名称 |
| `licenseUrl` | string | 否 | 自定义许可证链接 |
| `sourceLink` | string | 否 | 文章来源链接 |
| `password` | string | 否 | 文章密码，设置后文章将被加密保护 |
| `passwordHint` | string | 否 | 密码提示，显示在密码输入框上方 |

此外还支持：

- **封面图三种模式**：关闭 / 随机图 API（内置 4 个 PHP 类接口，均支持 `?id` 让每篇文章加载不同封面，也可自定义地址）/ 自定义地址
- **开源协议预设**：MIT、Apache-2.0、GPL、AGPL、LGPL、BSD、MPL、Unlicense、CC 系列等 14 种，选中自动填充名称与链接
- **自定义字段**：主题扩展字段可自由增删，原样写入 FrontMatter
- **时间精度切换**：仅日期 `2026-08-04` 或含时间 `2026-08-04 10:30:00`

---

## ✅ 内置 Markdown 编辑器

自研零依赖编辑器内核，不引入任何第三方编辑器库：

- **完整工具栏**：H1–H3、粗体、斜体、删除线、高亮、行内代码、引用、分割线、有序 / 无序 / 任务列表、链接、图片、表格、代码块、脚注；同类功能（图表 / 链接 / 代码 / 列表）已合并为下拉分组按钮
- **扩展语法工具栏**：内部链接、文章卡片、PlantUML、图片画廊、代码组、带行号代码块——均通过弹窗录入链接与内容（slug、别名、标题、图片地址、代码等），确认后插入对应 Markdown 语法，不再直接插入占位模板
- **`/` 斜杠命令**：在行首输入 `/` 唤出 20 项快捷命令菜单，方向键选择、回车插入
- **智能输入**：列表 / 引用自动续写、空条目自动结束、有序列表自动编号、选中文本按 `*` `(` `"` 等自动包裹
- **行级操作**：`Alt+↑/↓` 移动整行、`Ctrl+D` 复制行、`Ctrl+Shift+K` 删除行、`Tab` / `Shift+Tab` 批量缩进
- **查找替换**：支持大小写敏感与正则表达式，可逐个替换或全部替换
- **富文本粘贴**：从网页 / 文档粘贴自动转换为 Markdown（标题、列表、表格、链接、代码等）
- **拖拽导入**：`.md` 文件拖进窗口即可导入并回填全部配置
- **行号 · 光标定位 · 字数统计 · 阅读时长 · 专注模式**

### 快捷键

| 操作 | 快捷键 |
| --- | --- |
| 粗体 / 斜体 | `Ctrl+B` / `Ctrl+I` |
| 行内代码 | ``Ctrl+` `` |
| 插入链接 | `Ctrl+K` |
| 一 / 二 / 三级标题 | `Ctrl+1` / `Ctrl+2` / `Ctrl+3` |
| 查找替换 | `Ctrl+F` |
| 导出 MD | `Ctrl+S` |
| 复制全文 | `Ctrl+Shift+C` |
| 文档库 | `Ctrl+O` |
| 切换布局 | `Ctrl+\` |
| 专注模式 | `F11` |
| 帮助 | `F1` |
| 快捷命令 | `/` |

---

## ✅ Firefly 扩展语法

| 语法 | 写法 | 说明 |
| --- | --- | --- |
| 剧透遮罩 | `:spoiler[隐藏内容]` | 支持内嵌 Markdown，预览中悬停 / 点击显示 |
| GitHub 卡片 | `::github{repo="CuteLeaf/Firefly"}` | 数据由主题在前台从 GitHub API 动态获取 |
| 视频嵌入 | 弹窗输入链接自动生成 iframe | 自动识别 B 站 BV 号 / av 号 / 分 P、YouTube watch / youtu.be / shorts |
| 自定义 Iframe | 弹窗填写地址与宽高 | 可选 allowfullscreen |
| 提示块 | `> [!NOTE]` `[!TIP]` `[!IMPORTANT]` `[!WARNING]` `[!CAUTION]` `[!DANGER]` `[!SUCCESS]` `[!EXAMPLE]` `[!QUESTION]` `[!BUG]` `[!FAILURE]` `[!QUOTE]` `[!ABSTRACT]` `[!INFO]` | GitHub / Obsidian 风格警示框，共 14 种类型 |
| 提示块自定义标题 | `> [!NOTE] 阅读前须知` | 类型后接文字即为自定义标题，正文另起一行 |
| 提示块（Docusaurus） | `:::tip` `:::warning[自定义标题]` `:::` | 容器型，支持上述全部类型 |
| 提示块（Obsidian） | `!!! note "标题"` / `??? warning "标题"` | Python-Markdown 风格，`???` 为可折叠（默认收起） |
| 数学公式（行内） | `$E=mc^2$` | 零依赖 KaTeX 子集渲染，支持 `^` `_` `\frac` `\sqrt` `\sum` `\int` `\begin{pmatrix}` 矩阵等 |
| 数学公式（块级） | `$$ ... $$` | 居中显示，多行公式 |
| Mermaid 图表 | ` ```mermaid ` 代码块 | 预览中以代码卡片展示，构建时由 Firefly 渲染为静态 SVG |
| 内部链接（Wiki Link） | `[[slug]]` / `[[slug\|别名]]` / `[[#标题]]` | 生成 `/posts/{slug}/` 站内链接 |
| 文章卡片 | `![[slug]]` / `![[slug\|标题]]` | Obsidian 嵌入语法，渲染为卡片式内链（标题 + 路径） |
| PlantUML 图表 | ` ```plantuml ` 代码块 | 预览中以代码卡片展示，构建时由 Firefly 渲染为静态 SVG |
| 图片画廊 | `[grid]` 列表图片 `[/grid]` | 多图自适应网格排列，支持图注；可加列数 `[grid cols=3]`（1–6，窄屏自动降为 2 列） |
| 封面随机图 id | 封面设置选「随机 API」后填写 `06` | 生成 `random.php?06`，使每篇文章加载不同封面（也可填 `id=06` 等自定义参数） |
| 代码组 | `::: code-group labels=[…]` 内含多个代码块 `:::` | 多语言代码块标签页切换（纯 CSS，无需 JS）；未写 `labels` 时自动取子块的 `title` |
| 代码块标题 | ` ```js title="app.js" ` | 标题显示在代码块头部，代码组中作为标签页名 |
| 代码块行号 | ` ```js showLineNumbers ` | 左侧行号栏；`start=10` 指定起始行号，`noLineNumbers` 强制关闭 |
| 代码块行标记 | ` ```js {1,3-5} ` | 自动开启行号并高亮标记行（行号变色 + 整行底色） |
| 代码块自动换行 | ` ```js wrap ` | 长行折行显示；与行号互斥（折行后无法对齐） |
| 任务列表 | `- [ ]` / `- [x]` | |
| 脚注 | `正文[^1]` + `[^1]: 注释` | 自动生成脚注区与回跳链接 |

### 视频嵌入生成示例

**Bilibili**

```html
<iframe width="100%" height="468"
  src="//player.bilibili.com/player.html?bvid=BV_ID&p=1&autoplay=0&high_quality=1&danmaku=0"
  scrolling="no" border="0" frameborder="no"
  framespacing="0" allowfullscreen="true">
</iframe>
```

**YouTube**

```html
<iframe width="100%" height="468"
  src="https://www.youtube.com/embed/VIDEO_ID"
  title="YouTube video player"
  frameborder="0" allowfullscreen>
</iframe>
```

---

## ✅ 四栏实时预览

- **渲染预览**：自研 Markdown 解析器，效果与博客网站一致，含封面 / 标题 / 描述 / 标签等文章头部卡片
- **大纲**：自动提取全文标题，点击跳转到对应章节
- **YAML 高亮**：查看头部配置源码
- **完整源码**：直接可用的 Markdown 全文

预览支持与编辑器**滚动同步**，可随时开关。

内置代码高亮，支持 JavaScript / TypeScript / Python / Go / Rust / Java / C 系 / HTML / CSS / JSON / YAML / SQL / Shell 等常见语言。

---

## ✅ 文件与数据操作

- **导入本地 MD 文件**（点击或拖拽，自动回填所有配置，未知字段进入「自定义字段」）
- **一键导出 MD 博客文件**（文件名自动取 slug / 标题）
- **一键复制全文**
- **打印 / 导出 PDF**（仅输出渲染后的正文）
- **文档库**：本地保存多篇文章，可切换、导出、删除
- **一键重置**所有内容

> 所有数据仅保存在浏览器 `localStorage`，不会上传任何服务器。清空浏览器数据会丢失，重要文章请及时导出。

---

## 📁 项目结构

```
.
├── index.html      # 页面结构、布局、表单
├── styles.css      # 完整样式、双主题、响应式
├── app.js          # 核心编辑器逻辑
└── README.md       # 项目说明
```

> 无多余依赖、无多余文件、纯净极简。

---

## 🖥 兼容性

支持 Chrome / Edge / Firefox / Safari 等现代浏览器（近两年版本）及移动端浏览器。
不支持 IE。

---

## 📄 License

MIT
