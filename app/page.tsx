import { googleSignInPath, hasGoogleSession } from "./google-auth";
import Studio from "./studio";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ auth_error?: string }> }) {
  const signedIn = await hasGoogleSession();
  if (signedIn || process.env.NODE_ENV === "development") return <Studio />;
  const authError = (await searchParams).auth_error;
  const errorMessage = authError === "setup"
    ? "Google 로그인 연결값을 준비하는 중이에요. 잠시 후 다시 시도해주세요."
    : authError === "cancelled"
      ? "Google 로그인이 취소됐어요. 다시 눌러 이어갈 수 있어요."
      : authError
        ? "Google 로그인을 마치지 못했어요. 다시 한 번 시도해주세요."
        : "";

  return (
    <main className="signin-shell">
      <section className="signin-card">
        <p className="eyebrow">OTHER THAN WORKS</p>
        <img className="signin-character" src="/brand-character.png" alt="아더댄웍스 폴더 친구" />
        <h1>내 작업실로<br />돌아올 시간이에요</h1>
        <p>평소 쓰는 Google 계정으로 들어오면 다른 기기에서도 같은 캐릭터와 그림 기록을 이어볼 수 있어요.</p>
        {errorMessage && <p className="signin-error" role="alert">{errorMessage}</p>}
        <a className="signin-button" href={googleSignInPath()}>Google 계정으로 계속하기</a>
        <small>Google 직접 연결 전에는 다음 화면에서 <b>Google로 계속하기</b>를 선택해주세요.</small>
      </section>
    </main>
  );
}
