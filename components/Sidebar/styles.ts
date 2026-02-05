
export const SidebarStyles = {
  container: "flex flex-col h-full bg-white border-r border-slate-200 w-full md:w-80 shadow-sm",
  header: "p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-3",
  title: "text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2",
  searchContainer: "relative w-full",
  searchInput: "w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-blue-100 transition-all",
  searchIcon: "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400",
  listContainer: "flex-1 overflow-y-auto p-2 space-y-2 no-scrollbar bg-slate-50/30",
  itemCard: "group p-3 rounded-xl border transition-all cursor-pointer hover:shadow-md relative overflow-hidden",
  itemActive: "bg-blue-50 border-blue-200 shadow-sm",
  itemInactive: "bg-white border-slate-100 hover:border-blue-200 hover:bg-slate-50",
  statusBadge: "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border",
  emptyState: "flex flex-col items-center justify-center py-12 text-slate-400 gap-3",
  errorState: "p-4 bg-red-50 text-red-600 text-xs font-bold rounded-xl border border-red-100 text-center mx-2",
};
