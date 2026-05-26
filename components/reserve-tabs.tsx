"use client"

import { useState } from "react"
import { DepositorsTable } from "./depositors-table"
import { BorrowersTable } from "./borrowers-table"
import { CollateralUsersTable } from "./collateral-users-table"
import type {
  DepositorRow,
  BorrowerRow,
  CollateralUserRow,
} from "@/lib/views/reserve"

type Tab = "depositors" | "borrowers" | "collateral"

export function ReserveTabs({
  reserveSymbol,
  totalSupplyUsd,
  depositors,
  borrowers,
  collateralUsers,
}: {
  reserveSymbol: string
  totalSupplyUsd: number
  depositors: DepositorRow[]
  borrowers: BorrowerRow[]
  collateralUsers: CollateralUserRow[]
}) {
  const [tab, setTab] = useState<Tab>("depositors")

  return (
    <div>
      <div className="mb-3 flex items-center border-b border-[var(--color-border)]">
        <TabButton
          active={tab === "depositors"}
          onClick={() => setTab("depositors")}
          count={depositors.length}
        >
          {reserveSymbol} depositors
        </TabButton>
        <TabButton
          active={tab === "borrowers"}
          onClick={() => setTab("borrowers")}
          count={borrowers.length}
        >
          {reserveSymbol} borrowers
        </TabButton>
        <TabButton
          active={tab === "collateral"}
          onClick={() => setTab("collateral")}
          count={collateralUsers.length}
          disabled={collateralUsers.length === 0}
        >
          {reserveSymbol} used as collateral
        </TabButton>
      </div>
      {tab === "depositors" ? (
        <DepositorsTable rows={depositors} totalSupplyUsd={totalSupplyUsd} />
      ) : tab === "borrowers" ? (
        <BorrowersTable rows={borrowers} />
      ) : (
        <CollateralUsersTable rows={collateralUsers} />
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  disabled,
  count,
  children,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  count: number
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-[0.1em] transition-colors ${
        active
          ? "border-b-2 border-[var(--color-text)] text-[var(--color-text)]"
          : disabled
            ? "text-[var(--color-text-ghost)] opacity-50"
            : "text-[var(--color-text-ghost)] hover:text-[var(--color-text)]"
      }`}
    >
      <span>{children}</span>
      <span className="text-[var(--color-text-ghost)]">·</span>
      <span className="font-mono text-[var(--color-text-ghost)]">{count}</span>
    </button>
  )
}
