// obsidian-web 前端入口：Vue3 + element-plus 按需装配（T13 分包：web/src/element-plus.js 同包分模块）。
// ARC-1：本包零 markdown 解析——渲染 HTML 全部来自服务端 lib/render.js（唯一渲染源）。
import { createApp } from 'vue'
import App from './App.vue'
import './styles.css'

createApp(App).mount('#app')
