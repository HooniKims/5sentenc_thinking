interface PolicyLinksProps {
  readonly current?: "terms" | "privacy";
}

export function PolicyLinks({ current }: PolicyLinksProps): React.JSX.Element {
  return (
    <nav className="policy-links" aria-label="서비스 정책">
      <a href="/terms" aria-current={current === "terms" ? "page" : undefined}>이용약관</a>
      <a href="/privacy" aria-current={current === "privacy" ? "page" : undefined}>개인정보처리방침</a>
    </nav>
  );
}
