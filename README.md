# 本地 content.js 编辑器

这是一个只绑定到本机的内容编辑器，用来并排对照和编辑 `res/content.js` 中的三种语言。

## 使用

```sh
bun install
bun run editor
```

启动后，终端会打印一个带一次性令牌的本地地址。请直接打开该地址，例如：

`http://127.0.0.1:4173/editor/#token=...`

编辑器左、右两栏可以分别选择 `zh-CN`、`en-US` 或 `ru-RU`，也可以选择相同语言。所有字段都可以编辑；`markdown` 字段会在输入时进行 Markdown 预览。预览会移除脚本、iframe 和不安全链接，不会执行文章中的第三方嵌入代码。

使用“保存”按钮或 Ctrl/Cmd+S 保存。服务会先把当前文件备份到 `res/.content-backups/`，再校验并安全替换 `res/content.js`。编辑器使用版本号检测并发修改；如果文件已经被其他窗口更新，需要先重新加载。

## 注意

- 编辑器仅用于本地开发，不要把这个服务暴露到公网。
- `res/.content-backups/` 已加入 Git 忽略规则。需要恢复时，可停止编辑器后将备份文件复制回 `res/content.js`，再重新启动服务。
- 公共页面仍然通过浏览器脚本加载 `res/content.js`，编辑器生成的文件保持 `const content = ...` 格式。
