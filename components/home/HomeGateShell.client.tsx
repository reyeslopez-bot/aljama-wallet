"use client"

import { useEffect, useState } from "react"
import HomeActionButtons from "@/components/home/HomeActionButtons.client"
import { HumanGate } from "@/components/ui/HumanGate"
import { getHumanOk, setHumanOk } from "@/lib/storage/humanGate"

export default function HomeGateShell() {
  const [ok, setOk] = useState(false)

  useEffect(() => {
    setOk(getHumanOk())
  }, [])

  if (!ok) {
    return (
      <HumanGate
        onVerified={() => {
          setHumanOk()
          setOk(true)
        }}
      />
    )
  }

  return <HomeActionButtons />
}
