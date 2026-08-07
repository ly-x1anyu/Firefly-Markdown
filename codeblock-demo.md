```js
console.log('这段代码有语法高亮!')
```

```ansi
[1;4mStandard ANSI colors:[0m
- Foreground: [31m Red [32m Green [0m
- [1mBold[0m [2mDimmed[0m [4mUnderline[0m
- [7;31mReversed Red[0m [9mStrike[0m
```

```js title="my-test-file.js"
console.log('标题属性示例')
```

```html
<div>文件名注释示例</div>
```

```bash
echo "这个终端框架没有标题"
```

```powershell title="PowerShell 终端示例"
Write-Output "这个有标题!"
```

```sh frame="none"
echo "看，没有框架!"
```

```ps frame="code" title="PowerShell Profile.ps1"
# 如果不覆盖，这将是一个终端框架
function Watch-Tail { Get-Content -Tail 20 -Wait $args }
New-Alias tail Watch-Tail
```

```js {1, 4, 7-8}
// 第1行 - 通过行号定位
// 第2行
// 第3行
// 第4行 - 通过行号定位
// 第5行
// 第6行
// 第7行 - 通过范围 "7-8" 定位
// 第8行 - 通过范围 "7-8" 定位
```

```js title="line-markers.js" del={2} ins={3-4} {6}
function demo() {
  console.log('此行标记为已删除')
  // 此行和下一行标记为已插入
  console.log('这是第二个插入行')

  return '此行使用中性默认标记类型'
}
```

```jsx {"1":5} del={"2":7-8} ins={"3":10-12}
// labeled-line-markers.jsx
<button
  role="button"
  {...props}
  value={value}
  className={buttonClassName}
  disabled={disabled}
  active={active}
>
  {children &&
    !active &&
    (typeof children === 'string' ? <span>{children}</span> : children)}
</button>
```

```jsx {"1. Provide the value prop here:":5-6} del={"2. Remove the disabled and active states:":8-10} ins={"3. Add this to render the children inside the button:":12-15}
// labeled-line-markers.jsx
<button
  role="button"
  {...props}

  value={value}
  className={buttonClassName}

  disabled={disabled}
  active={active}
>

  {children &&
    !active &&
    (typeof children === 'string' ? <span>{children}</span> : children)}
</button>
```

```diff
+此行将标记为已插入
-此行将标记为已删除
这是常规行
```

```diff
--- a/README.md
+++ b/README.md
@@ -1,3 +1,4 @@
+this is an actual diff file
-all contents will remain unmodified
no whitespace will be removed either
```

```diff lang="js"
  function thisIsJavaScript() {
    // 整个块都会以 JavaScript 高亮显示，
    // 并且我们仍然可以为其添加 diff 标记，
-   console.log('要删除的旧代码')
+   console.log('新的闪亮代码，')
  }
```

```js "given text"
function demo() {
  // 标记行内的给定文本（given text）
  return 'this is a given text example string';
}
```

```ts /ye[sp]/
console.log('单词 yes 和 yep 将被标记。')
```

```sh /\/ho.*\//
echo "Test" > /home/test.txt
```

```js "return true;" ins="inserted" del="deleted"
function demo() {
  console.log('these are inserted and deleted marker types');
  // return 语句使用默认标记类型
  return true;
}
```

```js wrap
// 启用换行的示例
function getLongString() {
  return '这是一个非常长的字符串，除非容器极宽，否则很可能无法适应可用空间'
}
```

```js wrap=false
// wrap=false 的示例
function getLongString() {
  return '这是一个非常长的字符串，除非容器极宽，否则很可能无法适应可用空间'
}
```

```js wrap preserveIndent
// preserveIndent 示例（默认启用）
function getLongString() {
  return '这是一个非常长的字符串，除非容器极宽，否则很可能无法适应可用空间'
}
```

```js wrap preserveIndent=false
// preserveIndent=false 的示例
function getLongString() {
  return '这是一个非常长的字符串，除非容器极宽，否则很可能无法适应可用空间'
}
```

```js collapse={1-5, 12-14, 21-24}
// 所有这些样板代码将被折叠
import { someBoilerplateEngine } from '@example/some-boilerplate'
import { evenMoreBoilerplate } from '@example/even-more-boilerplate'

const engine = someBoilerplateEngine(evenMoreBoilerplate())

// 这部分代码默认可见
engine.doSomething(1, 2, 3, calcFn)

function calcFn() {
  // 您可以有多个折叠部分
  const a = 1
  const b = 2
  const c = a + b

  // 这将保持可见
  console.log(`计算结果: ${a} + ${b} = ${c}`)
  return c
}

// 直到块末尾的所有代码将再次被折叠
engine.closeConnection()
engine.freeMemory()
engine.shutdown({ reason: '示例样板代码结束' })
```

```js showLineNumbers
// 此代码块将显示行号
console.log('来自第2行的问候!')
console.log('我在第3行')
```

```js showLineNumbers=false
// 此块禁用行号
console.log('你好?')
console.log('等等，你知道我在第几行吗?')
```

```js showLineNumbers startLineNumber=5
console.log('来自第5行的问候!')
console.log('我在第6行')
```

## 文件名注释（首行整行注释且像文件名/路径 → 提取为标题并隐藏该行）

```html
<!-- src/content/index.html -->
<div>文件名注释示例</div>
```

```js
// src/index.js
export default {};
```

```vue
<!-- src/components/App.vue -->
<template><div>hi</div></template>
```

## 普通描述性注释（不会被误提取，保持可见）

```js showLineNumbers
// 整个块都会以 JavaScript 高亮显示，
// 并且我们仍然可以为其添加 diff 标记！
const x = 1;
```

```bash
# 这是一行普通注释说明
echo "hello"
```
