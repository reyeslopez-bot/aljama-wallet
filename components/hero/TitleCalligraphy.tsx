// components/hero/TitleCalligraphy.tsx
import React from "react";
import LanguageSwitcher from "../ui/LanguageSwitcher";
import DualLanguageTitle from "./Hero/DualLanguageTitle";

export const TitleCalligraphy: React.FC = () => {
    return (
        <div className="absolute top-4 right-4 z-20 flex items-end gap-2">
            <div className="flex items-end">
                <DualLanguageTitle arText="ﺎﻠﻤﻔﺗﺎﺣ" heText="המפתח" />
            </div>
            <div className="text-[#faf3e0] self-end">
                <LanguageSwitcher />
            </div>
        </div>
    );
};

