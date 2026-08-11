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
        <p>한 번 로그인하면 다른 기기에서도 같은 캐릭터와 그림 기록을 이어볼 수 있어요.</p>
        <a className="signin-button" href={chatGPTSignInPath("/")}>ChatGPT로 로그인</a>
        <small>처음 한 번만 수강생 명단에서 본인 이름을 연결해요.</small>
      </section>
    </main>
  );
}
