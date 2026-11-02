import { PageTitle } from "@/components/ui";
import { SeenMark } from "@/components/Discover54";
import { StoryStudio } from "@/components/Story56";

export const metadata = { title: "סטודיו סיפור אישי", description: "כתבו סיפור אישי שנשמע כמוכם: בניית סיפור בארבעה חלקים, ליטוש לעברית מדוברת, ספריית זיכרונות והוספה לפעולה." };

export default function Page() {
  return (
    <>
      <PageTitle lead="כתבו סיפור שנשמע כמוכם, שמרו זיכרונות, ושלבו אותם בפעולות.">סטודיו סיפור אישי</PageTitle>
      <SeenMark id="story" />
      <StoryStudio />
    </>
  );
}
