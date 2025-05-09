'use client'

export default function Footer() {
    return (
        <footer className="w-full bg-transparent text-gray-900 py-6 mt-12">
            <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between">
                <p className="text-sm">
                    &copy; {new Date().getFullYear()} Aljama Wallet. All rights reserved.
                </p>
                <div className="flex space-x-4 mt-4 md:mt-0">
                    <a href="#" className="text-sm hover:underline hover:text-yellow-600 transition">Privacy</a>
                    <a href="#" className="text-sm hover:underline hover:text-yellow-600 transition">Terms</a>
                    <a href="#" className="text-sm hover:underline hover:text-yellow-600 transition">Contact</a>
                </div>
            </div>
        </footer>
    )
}

