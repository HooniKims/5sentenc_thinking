import { PolicyLinks } from "./PolicyLinks";

type LegalDocument = "terms" | "privacy";

const serviceName = "5문장 길찾기";
const effectiveDate = "2026년 7월 17일";

function LegalFooter({ current }: { readonly current: LegalDocument }): React.JSX.Element {
  return (
    <footer className="site-footer">
      <div className="footer-inner">
        <p className="footer-brand">{serviceName}</p>
        <PolicyLinks current={current} />
        <p className="footer-contact">김형훈 · 02-6380-8387(교무실)</p>
      </div>
    </footer>
  );
}

function Terms(): React.JSX.Element {
  return (
    <article className="legal-document">
      <p className="eyebrow">서비스 정책</p>
      <h1>이용약관</h1>
      <p className="legal-effective-date">시행일: {effectiveDate}</p>
      <p>본 약관은 ‘{serviceName}’ 학습 웹앱(이하 ‘서비스’)을 수업 활동에 이용할 때 필요한 기본 사항을 정합니다.</p>

      <h2>제1조(서비스의 학습 목적)</h2>
      <p>서비스는 학생이 ‘여기에 어떻게 오셨어요?’라는 질문에 다섯 문장을 차례로 쓰며 자신의 경험과 생각을 구체화하도록 돕는 수업 도구입니다. 디디의 도움은 정답이나 문장을 대신 만드는 기능이 아니라, 다음 생각을 여는 질문을 제안하는 보조 기능입니다.</p>

      <h2>제2조(이용 대상과 방법)</h2>
      <p>서비스는 교사가 안내한 수업 활동 안에서 이용합니다. 입장에 쓰는 임시 닉네임은 다른 학생과 구별하기 위한 별칭으로만 사용합니다. 실명, 학번, 연락처, 주소, 학교·학급, 사진, 건강·평가 정보 등 개인을 알아볼 수 있는 정보는 입력하지 않습니다.</p>

      <h2>제3조(학생의 생각과 디디의 도움)</h2>
      <p>학생은 먼저 자신의 문장을 작성하고 저장합니다. 디디가 제안하는 질문은 검토할 재료일 뿐이며, 사실 여부와 최종 표현은 학생과 교사가 확인합니다. 도움 기능을 이용하지 않아도 다섯 문장 활동의 핵심 학습은 진행할 수 있습니다.</p>

      <h2>제4조(안전한 이용)</h2>
      <p>이용자는 수업과 관련된 내용만 작성하며, 자신이나 다른 사람의 개인정보, 차별·혐오·폭력적 표현, 타인의 저작물을 무단으로 복사한 내용을 입력하지 않습니다. 개인정보로 보이는 문장은 저장되지 않도록 안내·차단하며, 부적절한 이용이 확인되면 교사는 해당 활동을 중지하거나 기록 삭제를 안내할 수 있습니다.</p>

      <h2>제5조(학습 기록과 공개 범위)</h2>
      <p>안전 검사를 통과해 저장한 문장과 활동 상태는 수업 진행을 위해 해당 수업의 교사 대시보드에 표시됩니다. 다른 학생이나 외부에 자동으로 공개하지 않습니다. 교사는 수업 목적과 학교의 지침, 보호자 안내 범위 안에서 필요한 기록만 다룹니다.</p>

      <h2>제6조(서비스 변경과 중단)</h2>
      <p>수업 운영, 보안 조치, 오류 수정 또는 배포 환경 변경을 위해 서비스의 일부를 바꾸거나 일시적으로 중단할 수 있습니다. 중요한 변경은 수업 안내 또는 서비스 화면에 알립니다.</p>

      <h2>제7조(문의)</h2>
      <p>서비스 이용 관련 문의는 김형훈, 02-6380-8387(교무실)로 연락할 수 있습니다.</p>
    </article>
  );
}

function Privacy(): React.JSX.Element {
  return (
    <article className="legal-document">
      <p className="eyebrow">서비스 정책</p>
      <h1>개인정보처리방침</h1>
      <p className="legal-effective-date">시행일: {effectiveDate}</p>
      <p>‘{serviceName}’는 수업 활동에 필요한 정보만 최소한으로 다룹니다. 이 방침은 현재 서비스의 실제 처리 흐름과 학생의 알 권리를 기준으로 작성했습니다.</p>

      <h2>1. 개인정보처리자와 문의 창구</h2>
      <p>개인정보처리자 및 개인정보 보호 문의 담당: 김형훈 · 연락처: 02-6380-8387(교무실)</p>

      <h2>2. 처리하는 정보, 목적과 보유 기간</h2>
      <p id="privacy-table-help" className="legal-table-hint">표를 좌우로 밀어 모든 열을 확인하세요.</p>
      <div className="legal-table-wrap">
        <table>
          <thead><tr><th scope="col">처리 항목</th><th scope="col">처리 목적</th><th scope="col">보유·이용 기간</th></tr></thead>
          <tbody>
            <tr><td>Firebase 익명 사용자 식별자, 수업 링크의 수업 식별자</td><td>수업 참여 상태를 구분하고 학생 본인의 기록 접근을 보호</td><td>해당 수업이 보관 처리될 때까지</td></tr>
            <tr><td>임시 닉네임, 개인정보 검사를 통과한 확정 문장, 현재 단계와 활동 상태</td><td>다섯 문장 활동 진행 및 교사의 수업 지원</td><td>해당 수업이 보관 처리될 때까지. 교사가 수업 보관 시 학생 기록과 도움 요청 기록을 삭제</td></tr>
            <tr><td>도움 요청 시점과 단계</td><td>교사가 도움이 필요한 학생을 수업 중 확인</td><td>해당 수업이 보관 처리될 때까지</td></tr>
            <tr><td>초안 길이 구간, 문장 수, 관찰 범주, 반복 여부</td><td>디디 도움 질문의 방향 선택</td><td>AI 도움 요청 처리 후 서비스 운영자가 별도로 저장하지 않음</td></tr>
          </tbody>
        </table>
      </div>
      <p className="legal-note">서비스는 실명, 학번, 연락처, 주소, 사진, 평가 정보, 건강 정보처럼 개인을 알아볼 수 있거나 민감한 정보의 입력을 요구하지 않습니다. 작성 중인 초안은 저장하지 않으며, 개인정보로 보이는 문장은 저장 전에 차단합니다.</p>

      <h2>3. AI 도움 요청과 외부 전송</h2>
      <p>학생이 ‘도움!’ 버튼을 누른 경우에만 초안 원문이나 확정 문장을 보내지 않고, 현재 단계·문장 수·초안 길이 구간·관찰 범주·반복 여부 같은 비식별 작성 신호를 Upstage API에 전송합니다. Upstage는 이 신호를 바탕으로 미리 준비된 안전한 질문 방향 하나만 고르며, 서비스는 그 방향에 맞는 질문을 학생에게 보여 줍니다.</p>
      <p>AI 도움 기능을 이용하지 않으면 Upstage API로 정보를 전송하지 않습니다. API 제공사의 처리 국가·보유 기간·안전 조치는 해당 제공사의 최신 정책을 따르므로, 수업 운영 전 학교의 개인정보 보호 절차에 따라 사용 설정을 확인합니다.</p>

      <h2>4. 처리위탁 및 제3자 제공</h2>
      <p>서비스는 Firebase Authentication과 Cloud Firestore를 이용해 익명 인증과 수업 기록 저장을 처리합니다. 또한 도움 요청이 있을 때만 Upstage API를 이용합니다. 서비스 운영자는 학습 기록을 수업 목적 밖의 제3자에게 판매하거나 제공하지 않습니다. 위 서비스 제공자는 각 기능을 처리하기 위해 필요한 범위에서 정보를 처리할 수 있습니다.</p>

      <h2>5. 자동 수집 정보와 안전성</h2>
      <p>서비스는 광고·행동 분석 목적의 쿠키나 추적 도구를 사용하지 않습니다. Firebase 익명 인증과 Firestore 접근 통제, 인증된 교사의 대시보드 접근, 입력 단계의 개인정보 안내·차단을 적용합니다. 다만 자동 검사는 모든 개인정보를 완벽히 찾아내지 못할 수 있으므로, 개인정보를 입력하지 않는 것이 가장 중요합니다.</p>

      <h2>6. 정보주체의 권리와 행사 방법</h2>
      <p>이용자 또는 법정대리인은 자신의 정보에 대해 열람, 정정·삭제, 처리 정지를 요청할 수 있습니다. 교사는 수업 중 학생 기록을 삭제할 수 있고, 수업 보관 시 기록을 삭제합니다. 그 밖의 요청은 아래 문의처로 할 수 있습니다.</p>

      <h2>7. 아동·청소년 보호</h2>
      <p>만 14세 미만 아동의 개인정보를 법령상 동의를 받아 처리해야 하는 경우에는 법정대리인의 동의를 확인합니다. 서비스는 학생에게 이해하기 쉬운 말로 개인정보와 AI 도움 방식을 알리고, 교사와 보호자의 안내를 우선합니다.</p>

      <h2>8. 권익침해 구제</h2>
      <p>개인정보 침해 신고는 개인정보침해 신고센터(국번 없이 118), 개인정보 분쟁조정위원회(1833-6972)에 문의할 수 있습니다.</p>

      <h2>9. 방침의 변경</h2>
      <p>이 방침을 변경할 때에는 시행일과 변경 내용을 서비스 화면에서 안내합니다.</p>
    </article>
  );
}

export function LegalPage({ document }: { readonly document: LegalDocument }): React.JSX.Element {
  const isTerms = document === "terms";
  return (
    <div className="legal-page">
      <main className="legal-main">
        <a className="legal-back" href="/">학습 화면으로 돌아가기</a>
        {isTerms ? <Terms /> : <Privacy />}
      </main>
      <LegalFooter current={document} />
    </div>
  );
}
