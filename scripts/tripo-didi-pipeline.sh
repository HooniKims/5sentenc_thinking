#!/usr/bin/env bash
# 콘페스타 디디 캐릭터를 Tripo V3 API로 생성하는 파이프라인.
#
# 사용법:
#   bash scripts/tripo-didi-pipeline.sh
#
# 인증은 tripo CLI 프로필(~/.tripo/config.json)을 그대로 쓴다.
# 주의: TRIPO_API_KEY 환경변수를 export하면 프로필보다 우선하므로 .env의 옛 키를 주입하지 말 것.
#
# 산출물: artifacts/tripo/ 아래에 단계별 GLB·preview.png·task.json.
# 과금: 생성 + 리깅 + 애니메이션 5종(애니메이션당 과금). 실행 전 balance를 확인한다.
set -euo pipefail

OUT_DIR="artifacts/tripo"
mkdir -p "$OUT_DIR"

# 콘페스타 무대(깊은 보라 + 라임/분홍 신호색)와 어울리는 디디.
# 얼굴은 "빈 어두운 스크린"이어야 한다 — 표정·더빙은 앱이 2D 얼굴 평면(PNG 7종)으로 덧입힌다.
PROMPT="A cute friendly small round robot companion character standing in T-pose, \
smooth glossy body in white and deep purple, lime green and vivid pink accent lines, \
big rounded head with a completely blank dark glossy display screen as its face with no facial features, \
short stubby arms and legs, soft toy-like proportions, kid-friendly educational mascot, \
clean stylized 3D render, single character, full body, symmetrical"

echo "== 잔액 확인 ==" >&2
npx -y tripo-cli balance --json

echo "== 1) 캐릭터 생성 → 2) 리깅 검사 → 3) 리깅 → 4) 애니메이션 리타겟 ==" >&2
npx -y tripo-cli make "$PROMPT" --name didi-confesta -o "$OUT_DIR" --json --yes \
  | tee "$OUT_DIR/step1-make.json" \
  | npx -y tripo-cli anim check --json \
  | tee "$OUT_DIR/step2-check.json" \
  | npx -y tripo-cli anim rig --out-format glb --json \
  | tee "$OUT_DIR/step3-rig.json" \
  | npx -y tripo-cli anim retarget \
      --animation preset:idle preset:turn preset:walk preset:run preset:jump \
      --animate-in-place -o "$OUT_DIR" --json \
  | tee "$OUT_DIR/step4-retarget.json"

echo >&2
echo "== 산출물 ==" >&2
find "$OUT_DIR" -name "*.glb" -o -name "preview.png" | while read -r file; do
  du -h "$file" >&2
done

echo "다음 단계: preview.png를 확인하고, 마음에 들면 GLB의 클립 이름을 확인해 Robot3D에 연결한다." >&2
echo "클립 확인: npx @gltf-transform/cli inspect <retarget된 glb>" >&2
