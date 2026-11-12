import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import ScrollManager from "./components/ScrollManager";
import Preloader from "./components/Preloader";
import Home from "./pages/Home";
import About from "./pages/About";
import HowItWorks from "./pages/HowItWorks";
import Resources from "./pages/Resources";
import Community from "./pages/Community";
import Contact from "./pages/Contact";
import Support from "./pages/Support";
import Privacy from "./pages/Privacy";
import Status from "./pages/Status";
import NotFound from "./pages/NotFound";

function App() {
  const [loading, setLoading] = useState(true);

  return (
    <div className="min-h-screen bg-white">
      {loading && <Preloader onComplete={() => setLoading(false)} />}
      <ScrollManager />
      <Navbar />
      <main id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/resources" element={<Resources />} />
          <Route path="/community" element={<Community />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/support" element={<Support />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/status" element={<Status />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

export default App;
