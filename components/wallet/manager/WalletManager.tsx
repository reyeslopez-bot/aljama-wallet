"use client";

import React from "react";
import { useWalletDrawer } from "./WalletDrawer";  // hook you exported
import Button from "@/components/Button";

export default function WalletManager() {
    const { openDrawer } = useWalletDrawer();

    return (
        <div className="flex flex-col gap-4">
            <Button
                label="Create Wallet"
                color="yellow"
                action={() => openDrawer("create")}
            />
            <Button
                label="Unlock Wallet"
                color="green"
                action={() => openDrawer("unlock")}
            />
            <Button
                label="Import Wallet"
                color="blue"
                action={() => openDrawer("import")}
            />
        </div>
    );
}



