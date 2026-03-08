import { HelmetProvider } from 'react-helmet-async';
import { Helmet } from 'react-helmet-async';
import AeroPredict from '@/components/AeroPredict';

const Index = () => {
  return (
    <HelmetProvider>
      <Helmet>
        <title>AeroPredict - AI Arrival Sequencing & Conflict Avoidance System</title>
        <meta name="description" content="Advanced air traffic control visualization system with AI-powered arrival sequencing, conflict detection, and real-time flight tracking for VOHS airport." />
      </Helmet>
      <AeroPredict />
    </HelmetProvider>
  );
};

export default Index;
