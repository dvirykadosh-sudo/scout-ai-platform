"use client";

import { Suspense } from "react";
import { Generator } from "./Generator";
import { HomeInspiration, HomeWelcome } from "./HomeHero";
import { HomeMenu, HomeTabs, useHomeTab } from "./HomeParts";
import { AnnouncementsBanner } from "./CommunityParts";
import { QuickStart } from "./QuickStart";
import { RemindersBanner } from "./RemindersBanner";
import { ThisWeek } from "./ThisWeek";
import { TourButton } from "./WriteFinal";
import { Skeleton } from "./ui";

/** מבנה דף הבית: ברכה, שלוש פעולות עיקריות, ולשוניות שמפרידות בין האזורים. */
export function HomeShell() {
  const [tab, setTab] = useHomeTab();
  return (
    <>
      <HomeWelcome />
      <HomeMenu
        onCreate={() => {
          setTab("create");
          window.setTimeout(() => document.getElementById("step-title")?.focus(), 80);
        }}
      />
      <div className="home-tour">
        <TourButton kind="home" />
      </div>
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
    </>
  );
}
