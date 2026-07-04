# public/assets/warehouse

MIMESIS 공용 3D 자산을 넣는 폴더다.

현재 원본 파일은 대화 업로드로 받은 상태이며, 이 폴더에는 나중에 정리된 FBX/GLB/텍스처/썸네일을 배치한다.

## 권장 구조

```txt
01_path/
02_nature/
03_architecture/
04_props/
05_vehicles/
06_characters/
07_fx/
99_archive/
```

## 파일 규칙

- 원본은 가능하면 보존한다.
- 장면에 직접 쓰는 파일은 GLB로 변환한다.
- 큰 압축 파일은 원본 보관용으로만 둔다.
- 썸네일은 `thumbnail.png`로 통일한다.
- 각 자산 폴더에는 `meta.json`을 둔다.

## meta.json 예시

```json
{
  "name": "Old Suitcase",
  "category": "props/suitcase",
  "sourceFile": "Old_Suitcase.fbx",
  "priority": 5,
  "status": "candidate",
  "use": ["memory object", "start point", "travel"],
  "notes": "길 완성 후 감정 소품으로 우선 테스트"
}
```
