import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// base 는 GitHub Pages 프로젝트 경로다: https://<계정>.github.io/neutral-atom-landscape/
// ★ 저장소 이름을 바꾸면 이 값도 반드시 같이 바꿔라. 안 맞으면 assets 가 404 난다.
export default defineConfig({
  base: '/neutral-atom-landscape/',
  plugins: [react()],
})
