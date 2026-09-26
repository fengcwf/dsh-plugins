// obsidian-web 前端入口：Vue3 + element-plus（P2 定案）。
// ARC-1：本包零 markdown 解析——渲染 HTML 全部来自服务端 lib/render.js（唯一渲染源）。
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import './styles.css'

createApp(App).use(ElementPlus).mount('#app')
