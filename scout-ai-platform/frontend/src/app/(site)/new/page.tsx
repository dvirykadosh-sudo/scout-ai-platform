import { NewbieGuide } from "@/components/NewbieGuide";

export const metadata = { title: "מדריך חדש? מתחילים כאן" };

export default function Page() {
  return (
    <>
      <h1>מדריך חדש? מתחילים כאן</h1>
      <p className="lead">מסלול קצר לפעולה הראשונה, מילון מושגים וטיפים בכל פעולה.</p>
      <NewbieGuide />
    </>
  );
}
