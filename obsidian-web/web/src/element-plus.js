// element-plus 按需装配（T13 分包选型：**同包分模块按需**——非新依赖、零全量 import、
// 零全量主题 CSS；组件/样式只带本包用到的模块）。
// 选型记录（task-13-report §3）：方案 A=unplugin 按需插件（新依赖，白名单否决）；
// 方案 B=同包分模块手装配（本文件，白名单零变化）+ rollup manualChunks 显式分包边界（element-plus
// 独立 vendor chunk）——达成主入口 chunk ≤500KB 目标，异步加载仅在超限时启用（实测未触发）。
// 各 .vue 从本文件具名导入（script setup 自动注册），组件样式在此一次性按需引入。
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/dialog/style/css'
import 'element-plus/es/components/form/style/css'
import 'element-plus/es/components/form-item/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/input-number/style/css'
import 'element-plus/es/components/radio/style/css'
import 'element-plus/es/components/radio-group/style/css'
import 'element-plus/es/components/switch/style/css'
import 'element-plus/es/components/table/style/css'
import 'element-plus/es/components/table-column/style/css'
import 'element-plus/es/components/tag/style/css'
import 'element-plus/es/components/popconfirm/style/css'
import 'element-plus/es/components/tree-v2/style/css'
import 'element-plus/es/components/menu/style/css'
import 'element-plus/es/components/menu-item/style/css'

export {
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElMenu,
  ElMenuItem,
  ElPopconfirm,
  ElRadio,
  ElRadioGroup,
  ElSwitch,
  ElTable,
  ElTableColumn,
  ElTag,
  ElTreeV2,
} from 'element-plus/es'
