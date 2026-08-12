import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";
import Studio from "./studio";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getChatGPTUser();
  if (user || process.env.NODE_ENV === "development") return <Studio />;

  return (
    <main className="signin-shell">
      <section className="signin-card">
        <p className="eyebrow">OTHER THAN WORKS</p>
        <img className="signin-character" src="/brand-character.png" alt="아더댄웍스 폴더 친구" />
        <h1>내 작업실로<br />돌아올 시간이에요</h1>
        <p>평소 쓰는 Google 계정으로 들어오면 다른 기기에서도 같은 캐릭터와 그림 기록을 이어볼 수 있어요.</p>
        <a className="signin-button" href={chatGPTSignInPath("/")}>Google 계정으로 계속하기</a>
        <small>다음 로그인 화면에서 <b>Google로 계속하기</b>를 선택해주세요.</small>
      </section>
    </main>
  );
}
