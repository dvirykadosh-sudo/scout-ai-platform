import { WriteList } from "@/components/WritePage";

export const metadata = { title: "פעולה חדשה משלי", description: "כתבו פעולה בעצמכם בעורך חופשי, והאתר יסדר אותה לשלבים ויציע מתודות." };

export default function Page() {
  return (
    <>
      <h1>פעולה חדשה משלי</h1>
      <p className="lead">כותבים את הפעולה בעצמכם, שלב אחרי שלב, במסמך שנשמר לבד. אפשר בכל רגע לבקש מהעוזר לבדוק אותה.</p>
      <WriteList />
    </>
  );
}
