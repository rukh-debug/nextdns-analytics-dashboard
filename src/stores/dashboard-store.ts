import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface Group {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  deviceCount?: number;
  isActive?: boolean;
}

/** @deprecated Use Group */
export type Person = Group;

export interface Device {
  id: string;
  name: string;
  model: string | null;
  localIp: string | null;
  groupId: string | null;
  /** @deprecated Use groupId */
  personId?: string | null;
  isActive?: boolean;
  lastSeen?: string | null;
}

interface DashboardState {
  activeProfileId: string | null;
  selectedGroupId: string | null;
  /** @deprecated Use selectedGroupId */
  selectedPersonId: string | null;
  searchQuery: string;
  sidebarCollapsed: boolean;
  groups: Group[];
  /** @deprecated Use groups */
  persons: Group[];
  devices: Device[];

  setActiveProfile: (id: string | null) => void;
  setSelectedGroup: (id: string | null) => void;
  /** @deprecated Use setSelectedGroup */
  setSelectedPerson: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  toggleSidebar: () => void;
  setGroups: (groups: Group[]) => void;
  /** @deprecated Use setGroups */
  setPersons: (groups: Group[]) => void;
  setDevices: (devices: Device[]) => void;

}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      activeProfileId: null,
      selectedGroupId: null,
      selectedPersonId: null,
      searchQuery: "",
      sidebarCollapsed: false,
      groups: [],
      persons: [],
      devices: [],


      setActiveProfile: (id) =>
        set({ activeProfileId: id, selectedGroupId: null, selectedPersonId: null }),
      setSelectedGroup: (id) => set({ selectedGroupId: id, selectedPersonId: id }),
      setSelectedPerson: (id) => set({ selectedGroupId: id, selectedPersonId: id }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setGroups: (groups) => set({ groups, persons: groups }),
      setPersons: (groups) => set({ groups, persons: groups }),
      setDevices: (devices) => set({ devices }),

    }),
    {
      name: "ndns-dashboard-store",
      partialize: (state) => ({
        activeProfileId: state.activeProfileId,
      }),
    }
  )
);
