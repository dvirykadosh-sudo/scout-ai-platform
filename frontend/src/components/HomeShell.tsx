"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { Generator } from "./Generator";
import { HomeWelcome } from "./HomeHero";
import { HomeMenu, HomeTabs, useHomeTab } from "./HomeParts";
import { QuickStart } from "./QuickStart";
import { LastDocHero } from "./Polish";
import { HomeHow } from "./lux/HomeHow";
import { TodayCard } from "./lux/TodayCard";
import { Skeleton } from "./ui";

// שלב 66 (ממצא 89): מה שאינו חלק מהמסך הראשון נטען אחרי שהדף עלה, כדי שהטופס יופיע מהר ויהיה אינטראקטיבי קודם.
// רובם מופיעים ממילא רק אחרי שליפת נתונים או בלשונית אחרת. כפתור הסיור והבאנרים יופיעו רגע אחרי שהדף נטען.
const AnnouncementsBanner = dynamic(() => import("./CommunityParts").then((m) => m.AnnouncementsBanner), { ssr: false });
const NextStepCard = dynamic(() => import("./PilotParts").then((m) => m.NextStepCard), { ssr: false });
const UpcomingCard = dynamic(() => import("./WriteV36").then((m) => m.UpcomingCard), { ssr: false });
const TourButton = dynamic(() => import("./WriteFinal").then((m) => m.TourButton), { ssr: false });
const RemindersBanner = dynamic(() => import("./RemindersBanner").then((m) => m.RemindersBanner), { ssr: false });
const ThisWeek = dynamic(() => import("./ThisWeek").then((m) => m.ThisWeek), { ssr: false });
const HomeInspiration = dynamic(() => import("./HomeHero").then((m) => m.HomeInspiration), { ssr: false });

/** מבנה דף הבית: ברכה, שלוש פעולות עיקריות, ולשוניות שמפרידות בין האזורים. */
export function HomeShell() {
  const [tab, setTab] = useHomeTab();
  return (
    <>
      <HomeWelcome />
      <LastDocHero />
      <TodayCard />
      <HomeMenu
        onCreate={() => {
          setTab("create");
          window.setTimeout(() => document.getElementById("step-title")?.focus(), 80);
        }}
      />
      <div className="home-tour">
        <TourButton kind="home" />
      </div>
      <NextStepCard />
      <UpcomingCard />
      <AnnouncementsBanner />
      <HomeTabs
        active={tab}
        setActive={setTab}
        create={
          <>
            <Suspense fallback={<Skeleton lines={3} />}>
              <QuickStart />
            </Suspense>
            <Suspense fallback={<Skeleton lines={5} />}>
              <Generator />
            </Suspense>
          </>
        }
        ideas={<HomeInspiration />}
        week={
          <>
            <RemindersBanner />
            <ThisWeek />
          </>
        }
      />
      <HomeHow />
    </>
  );
}
