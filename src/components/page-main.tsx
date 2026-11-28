"use client";

import {
  createContext,
  useContext,
  type ComponentPropsWithoutRef,
} from "react";

const MainLandmarkContext = createContext(false);

type MainProps = ComponentPropsWithoutRef<"main">;

export function ShellMain({ children, ...props }: MainProps) {
  return (
    <main {...props}>
      <MainLandmarkContext.Provider value>
        {children}
      </MainLandmarkContext.Provider>
    </main>
  );
}

/** Keep a page's content wrapper when its shell already owns the landmark. */
export function PageMain(props: MainProps) {
  const Tag = useContext(MainLandmarkContext) ? "div" : "main";
  return <Tag {...props} />;
}
