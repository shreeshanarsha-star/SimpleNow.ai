import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full min-h-screen">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar title={title} />
        <main className="p-[26px] max-w-[1180px] w-full mx-auto flex-1 flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
