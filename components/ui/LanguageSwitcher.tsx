// components/LanguageSwitcher.tsx
import { useState } from 'react';
import { GlobeAltIcon } from '@heroicons/react/24/outline';

const languages = [
    { code: 'en', label: 'English' },
    { code: 'he', label: 'עברית' },
    { code: 'ar', label: 'العربية' },
];

export default function LanguageSwitcher() {
    const [open, setOpen] = useState(false);

    return (
        <div className="relative text-white z-50">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center space-x-1 hover:opacity-80 transition"
            >
                <GlobeAltIcon className="h-5 w-5" />
                <span className="text-sm">Language</span>
            </button>

            {open && (
                <ul className="absolute right-0 mt-2 w-32 bg-black/80 border border-white/20 rounded shadow backdrop-blur-md">
                    {languages.map(lang => (
                        <li
                            key={lang.code}
                            className="px-3 py-2 text-sm hover:bg-white/10 cursor-pointer"
                            onClick={() => {
                                // Handle language switch here
                                console.log(`Switch to ${lang.code}`);
                                setOpen(false);
                            }}
                        >
                            {lang.label}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

