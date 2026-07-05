/*
 * Copyright (c) 2023-2025 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import React, { useState, useEffect } from 'react';
import { Box, Button, Heading, Text, Link as PrimerLink } from '@primer/react';
import { useNavigate, useLocation, useParams, useHistory } from '../hooks';

/**
 * Native Navigation Example
 * This example demonstrates the navigation hooks WITHOUT React Router.
 * The hooks should automatically detect the absence of React Router and fall back to native browser navigation.
 */
export const NativeNavigationExample: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const history = useHistory();

  const [navigationType, setNavigationType] = useState<string>('detecting...');
  const [navigationCount, setNavigationCount] = useState(0);
  const [currentView, setCurrentView] = useState<string>('home');

  // Track navigation type detection
  useEffect(() => {
    // Since we're not using React Router, this should detect as 'native'
    setNavigationType('native');
  }, []);

  // Track navigation events
  useEffect(() => {
    setNavigationCount(prev => prev + 1);

    // Parse the path to determine which view to show
    const path = location.pathname;
    if (path.includes('page1')) {
      setCurrentView('page1');
    } else if (path.includes('page2')) {
      setCurrentView('page2');
    } else if (path.includes('page3')) {
      setCurrentView('page3');
    } else if (path.includes('user')) {
      setCurrentView('user');
    } else {
      setCurrentView('home');
    }
  }, [location]);

  const handleProgrammaticNavigation = () => {
    navigate('/page3', undefined, true);
  };

  const handleNavigateWithQuery = () => {
    navigate('/page2?test=456&native=true', undefined, true);
  };

  const handleNavigateWithHash = () => {
    navigate('/page3#native-section', undefined, true);
  };

  const handleBackNavigation = () => {
    history.back();
  };

  const handleForwardNavigation = () => {
    history.forward();
  };

  const handleReplaceNavigation = () => {
    history.replace('/replaced-page', { replaced: true });
  };

  // Simple link handler for native navigation
  const handleLinkClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    path: string,
  ) => {
    e.preventDefault();
    navigate(path, e, true);
  };

  // Render different content based on current view
  const renderContent = () => {
    switch (currentView) {
      case 'page1':
        return (
          <>
            <Heading as="h1" sx={{ mb: 3 }}>
              Page 1 (Native)
            </Heading>
            <Text as="p">
              You've navigated to Page 1 using native browser navigation.
            </Text>
          </>
        );
      case 'page2':
        return (
          <>
            <Heading as="h1" sx={{ mb: 3 }}>
              Page 2 (Native)
            </Heading>
            <Text as="p">
              This is Page 2 with native navigation. Check the query parameters!
            </Text>
          </>
        );
      case 'page3':
        return (
          <>
            <Heading as="h1" sx={{ mb: 3 }}>
              Page 3 (Native)
            </Heading>
            <Text as="p">
              Welcome to Page 3 using native browser APIs. Notice the hash in
              the URL!
            </Text>
          </>
        );
      case 'user':
        return (
          <>
            <Heading as="h1" sx={{ mb: 3 }}>
              User Page (Native)
            </Heading>
            <Text as="p">
              User pages with native navigation. Path: {location.pathname}
            </Text>
          </>
        );
      default:
        return (
          <>
            <Heading as="h1" sx={{ mb: 3 }}>
              Home Page (Native)
            </Heading>
            <Text as="p">
              This is the home page of the Native navigation example.
            </Text>
          </>
        );
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', p: 4 }}>
      <Box sx={{ mb: 4, p: 3, bg: 'canvas.subtle', borderRadius: 2 }}>
        <Heading as="h1" sx={{ mb: 2 }}>
          Native Browser Navigation Example
        </Heading>
        <Text as="p" sx={{ mb: 2 }}>
          This example demonstrates the navigation hooks WITHOUT React Router
          context. The hooks automatically fall back to native browser
          navigation (history API).
        </Text>
        <Text as="p" sx={{ color: 'attention.fg', fontWeight: 'bold' }}>
          ⚠️ No React Router is loaded in this example - using native browser
          APIs only!
        </Text>
      </Box>

      {renderContent()}

      <Box sx={{ mt: 4 }}>
        <Heading as="h2" sx={{ mb: 3 }}>
          Navigation Information
        </Heading>

        <Box
          sx={{
            mb: 4,
            p: 3,
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: 'border.default',
            borderRadius: 2,
          }}
        >
          <Text as="p" sx={{ mb: 2 }}>
            <strong>Navigation Type Detected:</strong>{' '}
            <Text
              as="span"
              sx={{
                color: navigationType === 'native' ? 'success.fg' : 'danger.fg',
              }}
            >
              {navigationType}
            </Text>
          </Text>
          <Text as="p" sx={{ mb: 2 }}>
            <strong>Current Path:</strong> {location.pathname}
          </Text>
          <Text as="p" sx={{ mb: 2 }}>
            <strong>Search Params:</strong> {location.search || '(none)'}
          </Text>
          <Text as="p" sx={{ mb: 2 }}>
            <strong>Hash:</strong> {location.hash || '(none)'}
          </Text>
          <Text as="p" sx={{ mb: 2 }}>
            <strong>Location Key:</strong> {location.key}
          </Text>
          <Text as="p" sx={{ mb: 2 }}>
            <strong>State:</strong> {JSON.stringify(location.state) || '(none)'}
          </Text>
          <Text as="p" sx={{ mb: 2 }}>
            <strong>URL Params (parsed from search):</strong>{' '}
            {JSON.stringify(params)}
          </Text>
          <Text as="p">
            <strong>Navigation Count:</strong> {navigationCount}
          </Text>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Heading as="h3" sx={{ mb: 2 }}>
            Test Programmatic Navigation
          </Heading>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button onClick={handleProgrammaticNavigation}>
              Navigate to /page3
            </Button>
            <Button onClick={handleNavigateWithQuery} variant="default">
              Navigate with Query Params
            </Button>
            <Button onClick={handleNavigateWithHash} variant="default">
              Navigate with Hash
            </Button>
            <Button onClick={handleReplaceNavigation} variant="default">
              Replace Current Entry
            </Button>
          </Box>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Heading as="h3" sx={{ mb: 2 }}>
            Test History API
          </Heading>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Button onClick={handleBackNavigation} variant="default">
              History Back
            </Button>
            <Button onClick={handleForwardNavigation} variant="default">
              History Forward
            </Button>
          </Box>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Heading as="h3" sx={{ mb: 2 }}>
            Test Link Navigation
          </Heading>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <PrimerLink
              href="/"
              onClick={e => handleLinkClick(e, '/')}
              sx={{ cursor: 'pointer' }}
            >
              Home
            </PrimerLink>
            <PrimerLink
              href="/page1"
              onClick={e => handleLinkClick(e, '/page1')}
              sx={{ cursor: 'pointer' }}
            >
              Page 1
            </PrimerLink>
            <PrimerLink
              href="/page2?test=123"
              onClick={e => handleLinkClick(e, '/page2?test=123')}
              sx={{ cursor: 'pointer' }}
            >
              Page 2 with Query
            </PrimerLink>
            <PrimerLink
              href="/page3#section"
              onClick={e => handleLinkClick(e, '/page3#section')}
              sx={{ cursor: 'pointer' }}
            >
              Page 3 with Hash
            </PrimerLink>
            <PrimerLink
              href="/user/456"
              onClick={e => handleLinkClick(e, '/user/456')}
              sx={{ cursor: 'pointer' }}
            >
              User 456
            </PrimerLink>
          </Box>
        </Box>

        <Box sx={{ mt: 4, p: 3, bg: 'attention.subtle', borderRadius: 2 }}>
          <Heading as="h3" sx={{ mb: 2 }}>
            How This Works
          </Heading>
          <Text as="p" sx={{ mb: 2 }}>
            This example does NOT include React Router. The navigation hooks
            automatically detect this and:
          </Text>
          <Box as="ul" sx={{ pl: 4 }}>
            <Text as="li">
              Use <code>window.history.pushState()</code> for navigation
            </Text>
            <Text as="li">
              Listen to <code>popstate</code> events for browser back/forward
            </Text>
            <Text as="li">
              Parse <code>window.location</code> for current path and params
            </Text>
            <Text as="li">
              Provide the same API as when React Router is present
            </Text>
          </Box>
          <Text as="p" sx={{ mt: 2 }}>
            The beauty is that the same hooks work in both scenarios without any
            code changes!
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

export default NativeNavigationExample;
