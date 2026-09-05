/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

import type { JSX } from 'react';
import { useState, useEffect } from 'react';
import { Box } from '@datalayer/primer-addons';
import { ConsumptionBar } from '@datalayer/core/lib/components/progress/ConsumptionBar';
import { useNavigate } from '@datalayer/core/lib/hooks/useNavigate';
import type { IRemoteServicesManager } from '../../runtimes';
import type { IRuntimeModel } from '../../models';

type ICreditsIndicatorProps = {
  /**
   * Kernel service manager
   */
  serviceManager: IRemoteServicesManager;
  /**
   * Kernel ID
   */
  kernelId: string;
  /**
   * Route to navigate to when the indicator is clicked.
   * Ignored if `onClick` is provided.
   */
  navigateTo?: string;
  /**
   * Callback on progress bar click event.
   * Takes precedence over `navigateTo`.
   */
  onClick?: () => void;
  /**
   * Callback on progress update.
   *
   * Progress is a percentage between 0 and 100.
   * Duration is the kernel max duration
   */
  onUpdate?: (progress: number, duration: number) => void;
  /**
   * Paddings of the indicator, each defaulting to the current ones.
   */
  paddingLeft?: number | string;
  paddingRight?: number | string;
  paddingTop?: number | string;
  paddingBottom?: number | string;
};

/**
 * Credits indicator component.
 */
export function CreditsIndicator(
  props: ICreditsIndicatorProps,
): JSX.Element | null {
  const {
    serviceManager,
    kernelId,
    navigateTo,
    onClick,
    onUpdate,
    paddingLeft,
    paddingRight,
    paddingTop,
    paddingBottom,
  } = props;
  const navigate = useNavigate();
  const [model, setModel] = useState<IRuntimeModel>();
  useEffect(() => {
    serviceManager.runtimesManager.findById(kernelId).then(model => {
      setModel(model);
    });
  }, [kernelId, serviceManager]);
  return model ? (
    <Box display="flex" style={{ alignItems: 'center' }}>
      <ConsumptionBar
        startedAt={parseFloat(model.started_at)}
        expiredAt={model.expired_at ? parseFloat(model.expired_at) : undefined}
        burningRate={model.burning_rate}
        onClick={
          onClick ?? (navigateTo ? () => navigate(navigateTo) : undefined)
        }
        onUpdate={onUpdate}
        style={{ cursor: 'pointer' }}
        paddingLeft={paddingLeft}
        paddingRight={paddingRight}
        paddingTop={paddingTop}
        paddingBottom={paddingBottom}
      />
    </Box>
  ) : (
    <></>
  );
}
