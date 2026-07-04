# MIMESIS Asset Registry

- 실물 창고: GitHub Releases `assets-v1` (87개, 2.0GB) + `assets-v2` (56개, 0.6GB)
- 인덱스: 이 폴더의 registry JSON/MD (홈즈 작성, 123개 기준 — v2 추가분은 릴리즈 목록 참조)
- 프로덕션 투입분: `public/assets/models/*.glb` (FBX→GLB 변환 + 팔레트 오버라이드 전제)
- 변환 파이프라인: fbx2gltf → applyPalette() → normalizeModel() (worldCore.ts 참조)
