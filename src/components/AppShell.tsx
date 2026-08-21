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
    <div className="flex w-full h-screen p-4 gap-4 overflow-hidden">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col bg-white rounded-[28px] shadow-soft overflow-hidden">
        <Topbar title={title} />
        <main className="flex-1 min-h-0 overflow-y-auto p-[26px] max-w-[1180px] w-full mx-auto flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}
