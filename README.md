# SIDE A/B 카드 스튜디오

중앙을 기준으로 좌우에 놓인 SIDE A / SIDE B 카드에 이미지와 글자를 넣고, PNG 또는 전환 효과가 들어간 GIF로 저장하는 도구입니다. 서버 없이 브라우저 안에서만 동작하며, 넣은 이미지는 어디에도 업로드되지 않습니다.

## GitHub Pages에 올리기

1. GitHub에서 새 저장소(repository)를 만듭니다. 무료 계정은 공개(Public) 저장소여야 Pages를 쓸 수 있습니다.
2. 이 폴더 안의 파일을 **폴더 구조 그대로** 저장소에 올립니다. (`Add file → Upload files`에 전부 끌어다 놓으면 됩니다. `.nojekyll` 파일도 함께 올려 주세요.)
3. 저장소의 `Settings → Pages`에서 `Source`를 `Deploy from a branch`, 브랜치를 `main` / `(root)`로 고르고 저장합니다.
4. 1~2분 뒤 `https://<계정이름>.github.io/<저장소이름>/` 주소로 접속합니다.

올리지 않고 `index.html`을 더블클릭해 바로 열어도 동작합니다.

## 사용법

- **SIDE A / SIDE B 탭**: 카드를 추가하고 이미지·제목·짧은 문구를 넣습니다. 이미지는 눌러서 고르거나 끌어다 놓습니다.
- **배경 탭**: 단색·그라데이션·이미지(흐림 조절) 배경과 배경 큰 글자를 설정합니다. 배경을 여러 개 만들면 장면마다 다르게 쓸 수 있습니다.
- **스타일 탭**: 폰트(기본 Pretendard, Google Fonts 추가 가능), 카드 크기·색·글자 크기, 두 카드 사이 중앙 글자를 조정합니다.
- **타임라인(아래쪽)**: 장면 순서와 전환을 다룹니다.
  - `동시에 넘기기`: A와 B가 함께 다음 카드로 넘어갑니다.
  - `번갈아 넘기기`: A → B → A → B 순서로 한쪽씩 넘어갑니다.
  - `직접 구성`: 장면마다 어떤 카드와 배경을 보여 줄지 직접 고릅니다.
  - 장면을 누르면 그 장면의 전환 효과, 전환 시간, A·B 시간차, 유지 시간을 바꿀 수 있습니다.
  - 타임라인을 누르거나 끌면 전환 도중의 화면도 미리 볼 수 있습니다. 스페이스바로 재생/멈춤.
- **저장 탭**: PNG(지금 화면 / 모든 장면 ZIP), GIF, 작업 파일(.json) 저장·불러오기.

입력 내용은 브라우저에 자동으로 임시 저장됩니다. 다른 기기로 옮기거나 오래 보관하려면 작업 파일로 저장하세요.

## 파일 구성

| 파일 | 역할 |
| --- | --- |
| `index.html` | 화면 뼈대 |
| `css/style.css` | 편집 화면(메뉴·타임라인)의 모양 |
| `js/render.js` | **템플릿 그리기** — 카드, 배경, 큰 글자, 전환 효과 |
| `js/export.js` | PNG / GIF / ZIP 내보내기 |
| `js/app.js` | 좌측 메뉴, 타임라인, 저장·불러오기 |
| `js/gifenc.js` | GIF 인코더 (외부 라이브러리) |
| `fonts/` | Pretendard 가변 폰트 |

### 템플릿 디자인을 고칠 때

- 카드 한 장의 생김새: `js/render.js`의 `drawCardContent()`
- 배경과 큰 글자: `js/render.js`의 `drawBackgroundInto()`
- 카드 위치(좌우 대칭 배치): `js/render.js`의 `CS.cardRects()`
- 전환 효과 추가·수정: `js/render.js`의 `CS.EFFECTS` 목록과 `drawCardTransition()`
- 각 설정의 기본값: `js/app.js`의 `DEFAULT_STYLE`, `newBg()`, `newScene()`

기준 캔버스는 1920×1080으로 고정이고, 저장할 때 배율만 바꿉니다.

## 알아 둘 점

- GIF는 한 프레임에 256색만 쓸 수 있어 PNG보다 색이 거칩니다. `색 띠 줄이기`를 켜면 부드러워지는 대신 용량이 1.5~2배로 늘어납니다.
- 뒤집기 효과는 원근감이 있는 3D 회전이 아니라 카드가 접혔다 펴지는 방식입니다.
- 움직이는 GIF를 카드에 넣으면 첫 장면만 쓰입니다.
- 한 변이 2400px을 넘는 이미지는 넣을 때 자동으로 줄입니다.
- Google Fonts는 인터넷 연결이 필요하며, 불러오지 못하면 Pretendard로 표시됩니다.

## 라이선스 표기

- Pretendard — SIL Open Font License 1.1 (`fonts/Pretendard-LICENSE.txt`)
- gifenc — MIT License, Matt DesLauriers (https://github.com/mattdesl/gifenc)
