import Image from "next/image";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-primary-700 text-white p-4 shadow-md">
        <div className="container mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">Chord Recognition App</h1>
          <nav>
            <ul className="flex space-x-4">
              <li><a href="#" className="hover:text-primary-200">Home</a></li>
              <li><a href="#" className="hover:text-primary-200">About</a></li>
            </ul>
          </nav>
        </div>
      </header>

      <main className="flex-grow container mx-auto p-4 md:p-8">
        <section className="mb-12 text-center">
          <h2 className="text-4xl font-bold mb-4 text-primary-700">Discover Chords in Your Favorite Songs</h2>
          <p className="text-xl mb-8 max-w-3xl mx-auto">
            Our chord recognition system analyzes music from YouTube videos to identify chords and beats,
            helping you learn and play along with your favorite songs.
          </p>
          <div className="bg-gray-100 p-6 rounded-lg shadow-md max-w-2xl mx-auto">
            <div className="mb-4">
              <input
                type="text"
                placeholder="Enter YouTube URL or search for a song..."
                className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <button className="bg-primary-600 hover:bg-primary-700 text-white font-bold py-3 px-6 rounded-md transition-colors">
              Analyze Song
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-primary-600 text-4xl mb-4">1</div>
            <h3 className="text-xl font-bold mb-2">Search for a Song</h3>
            <p>Enter a YouTube URL or search for your favorite song directly in our app.</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-primary-600 text-4xl mb-4">2</div>
            <h3 className="text-xl font-bold mb-2">Analyze the Audio</h3>
            <p>Our system extracts the audio and processes it through advanced chord and beat detection models.</p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <div className="text-primary-600 text-4xl mb-4">3</div>
            <h3 className="text-xl font-bold mb-2">View the Results</h3>
            <p>See chord progressions synchronized with the music and play along with the interactive display.</p>
          </div>
        </section>
      </main>

      <footer className="bg-gray-800 text-white p-6">
        <div className="container mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="mb-4 md:mb-0">
              <h2 className="text-xl font-bold">Chord Recognition App</h2>
              <p className="text-gray-400">Discover and learn chords from your favorite songs</p>
            </div>
            <div>
              <p className="text-gray-400">&copy; {new Date().getFullYear()} Chord Recognition App. All rights reserved.</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
