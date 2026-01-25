/*
 * Copyright (c) 2025-2026 Datalayer, Inc.
 * Distributed under the terms of the Modified BSD License.
 */

/**
 * AgUiSharedStateExample
 *
 * Demonstrates bidirectional state synchronization between the frontend
 * and the AI agent using AG-UI. This example shows a recipe builder where
 * both the user and the AI can modify the shared state.
 *
 * Backend: /api/v1/examples/shared_state/
 */

import React, { useState, useCallback } from 'react';
import { Text, Button, TextInput, Label } from '@primer/react';
import { Box } from '@datalayer/primer-addons';
import { DatalayerThemeProvider } from '@datalayer/core';
import { ChatFloating } from '../components/chat';
import {
  PlusIcon,
  XIcon,
  BeakerIcon,
  ClockIcon,
  PersonIcon,
} from '@primer/octicons-react';

// AG-UI endpoint for shared state example
const SHARED_STATE_ENDPOINT =
  'http://localhost:8765/api/v1/examples/shared_state/';

// Types for recipe state
interface RecipeState {
  title: string;
  description: string;
  ingredients: string[];
  instructions: string[];
  servings: number;
  prepTime: string;
  cookTime: string;
}

const DEFAULT_RECIPE: RecipeState = {
  title: '',
  description: '',
  ingredients: [],
  instructions: [],
  servings: 4,
  prepTime: '',
  cookTime: '',
};

/**
 * IngredientsList Component
 * Editable list of ingredients
 */
const IngredientsList: React.FC<{
  ingredients: string[];
  onAdd: (ingredient: string) => void;
  onRemove: (index: number) => void;
}> = ({ ingredients, onAdd, onRemove }) => {
  const [newIngredient, setNewIngredient] = useState('');

  const handleAdd = () => {
    if (newIngredient.trim()) {
      onAdd(newIngredient.trim());
      setNewIngredient('');
    }
  };

  return (
    <Box>
      <Text
        as="h4"
        sx={{ fontSize: 1, fontWeight: 'semibold', marginBottom: 2 }}
      >
        Ingredients
      </Text>
      <Box sx={{ display: 'flex', gap: 2, marginBottom: 2 }}>
        <TextInput
          value={newIngredient}
          onChange={e => setNewIngredient(e.target.value)}
          placeholder="Add an ingredient..."
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          sx={{ flex: 1 }}
        />
        <Button onClick={handleAdd} leadingVisual={PlusIcon} size="small">
          Add
        </Button>
      </Box>
      {ingredients.length === 0 ? (
        <Text sx={{ fontSize: 0, color: 'fg.muted', fontStyle: 'italic' }}>
          No ingredients yet
        </Text>
      ) : (
        <Box as="ul" sx={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {ingredients.map((ingredient, index) => (
            <Box
              as="li"
              key={index}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 1,
                borderBottom: '1px solid',
                borderColor: 'border.default',
                '&:last-child': { borderBottom: 'none' },
              }}
            >
              <Text sx={{ fontSize: 1 }}>{ingredient}</Text>
              <Button
                variant="invisible"
                size="small"
                onClick={() => onRemove(index)}
                aria-label="Remove"
              >
                <XIcon size={12} />
              </Button>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

/**
 * InstructionsList Component
 * Editable list of cooking instructions
 */
const InstructionsList: React.FC<{
  instructions: string[];
  onAdd: (instruction: string) => void;
  onRemove: (index: number) => void;
}> = ({ instructions, onAdd, onRemove }) => {
  const [newInstruction, setNewInstruction] = useState('');

  const handleAdd = () => {
    if (newInstruction.trim()) {
      onAdd(newInstruction.trim());
      setNewInstruction('');
    }
  };

  return (
    <Box>
      <Text
        as="h4"
        sx={{ fontSize: 1, fontWeight: 'semibold', marginBottom: 2 }}
      >
        Instructions
      </Text>
      <Box sx={{ display: 'flex', gap: 2, marginBottom: 2 }}>
        <TextInput
          value={newInstruction}
          onChange={e => setNewInstruction(e.target.value)}
          placeholder="Add an instruction..."
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          sx={{ flex: 1 }}
        />
        <Button onClick={handleAdd} leadingVisual={PlusIcon} size="small">
          Add
        </Button>
      </Box>
      {instructions.length === 0 ? (
        <Text sx={{ fontSize: 0, color: 'fg.muted', fontStyle: 'italic' }}>
          No instructions yet
        </Text>
      ) : (
        <Box as="ol" sx={{ paddingLeft: 3, margin: 0 }}>
          {instructions.map((instruction, index) => (
            <Box
              as="li"
              key={index}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 2,
              }}
            >
              <Text sx={{ fontSize: 1, flex: 1 }}>{instruction}</Text>
              <Button
                variant="invisible"
                size="small"
                onClick={() => onRemove(index)}
                aria-label="Remove"
              >
                <XIcon size={12} />
              </Button>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

/**
 * RecipeDisplay Component
 * Main recipe editor/display
 */
const RecipeDisplay: React.FC<{
  recipe: RecipeState;
  onUpdate: (updates: Partial<RecipeState>) => void;
}> = ({ recipe, onUpdate }) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Title and description */}
      <Box>
        <TextInput
          value={recipe.title}
          onChange={e => onUpdate({ title: e.target.value })}
          placeholder="Recipe title..."
          sx={{
            fontSize: 2,
            fontWeight: 'bold',
            marginBottom: 2,
            width: '100%',
          }}
        />
        <TextInput
          as="textarea"
          value={recipe.description}
          onChange={e => onUpdate({ description: e.target.value })}
          placeholder="Recipe description..."
          sx={{ width: '100%', minHeight: '60px', resize: 'vertical' }}
        />
      </Box>

      {/* Meta info */}
      <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PersonIcon size={14} />
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>Servings:</Text>
          <TextInput
            type="number"
            value={recipe.servings}
            onChange={e =>
              onUpdate({ servings: parseInt(e.target.value) || 0 })
            }
            sx={{ width: '60px' }}
            min={1}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ClockIcon size={14} />
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>Prep:</Text>
          <TextInput
            value={recipe.prepTime}
            onChange={e => onUpdate({ prepTime: e.target.value })}
            placeholder="30 min"
            sx={{ width: '80px' }}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BeakerIcon size={14} />
          <Text sx={{ fontSize: 0, color: 'fg.muted' }}>Cook:</Text>
          <TextInput
            value={recipe.cookTime}
            onChange={e => onUpdate({ cookTime: e.target.value })}
            placeholder="1 hour"
            sx={{ width: '80px' }}
          />
        </Box>
      </Box>

      {/* Two columns for ingredients and instructions */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: ['1fr', '1fr 1fr'],
          gap: 4,
        }}
      >
        <IngredientsList
          ingredients={recipe.ingredients}
          onAdd={ingredient =>
            onUpdate({ ingredients: [...recipe.ingredients, ingredient] })
          }
          onRemove={index =>
            onUpdate({
              ingredients: recipe.ingredients.filter((_, i) => i !== index),
            })
          }
        />
        <InstructionsList
          instructions={recipe.instructions}
          onAdd={instruction =>
            onUpdate({ instructions: [...recipe.instructions, instruction] })
          }
          onRemove={index =>
            onUpdate({
              instructions: recipe.instructions.filter((_, i) => i !== index),
            })
          }
        />
      </Box>
    </Box>
  );
};

/**
 * AgUiSharedStateExample Component
 *
 * Demonstrates bidirectional shared state with AG-UI.
 * Both the frontend and the AI agent can modify the recipe state,
 * with changes synchronized via STATE_SNAPSHOT events.
 *
 * Features demonstrated:
 * - Bidirectional state synchronization
 * - StateDeps for passing state to agent
 * - STATE_SNAPSHOT for receiving state from agent
 * - Editable UI that updates shared state
 */
const AgUiSharedStateExample: React.FC = () => {
  const [recipe, setRecipe] = useState<RecipeState>(DEFAULT_RECIPE);

  // Handle state updates from AG-UI
  const handleStateUpdate = useCallback((state: unknown) => {
    const s = state as RecipeState;
    if (s) {
      setRecipe(prev => ({
        ...prev,
        ...s,
        ingredients: s.ingredients || prev.ingredients,
        instructions: s.instructions || prev.instructions,
      }));
    }
  }, []);

  // Handle local updates
  const handleLocalUpdate = useCallback((updates: Partial<RecipeState>) => {
    setRecipe(prev => ({ ...prev, ...updates }));
  }, []);

  // Clear recipe
  const handleClear = useCallback(() => {
    setRecipe(DEFAULT_RECIPE);
  }, []);

  return (
    <DatalayerThemeProvider>
      <Box
        sx={{
          minHeight: '100vh',
          backgroundColor: 'canvas.default',
          padding: 4,
        }}
      >
        {/* Page content */}
        <Box
          sx={{
            maxWidth: '900px',
            margin: '0 auto',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 4,
            }}
          >
            <Box>
              <Text
                as="h1"
                sx={{
                  fontSize: 4,
                  fontWeight: 'bold',
                  marginBottom: 2,
                }}
              >
                AG-UI: Shared State Example
              </Text>
              <Text
                as="p"
                sx={{
                  fontSize: 2,
                  color: 'fg.muted',
                }}
              >
                Build a recipe together with AI. Both you and the agent can edit
                the recipe.
              </Text>
            </Box>
            <Button variant="danger" onClick={handleClear}>
              Clear Recipe
            </Button>
          </Box>

          {/* Recipe editor panel */}
          <Box
            sx={{
              padding: 4,
              backgroundColor: 'canvas.subtle',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'border.default',
              marginBottom: 4,
            }}
          >
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 3,
              }}
            >
              <Text as="h2" sx={{ fontSize: 2, fontWeight: 'semibold' }}>
                Recipe Builder
              </Text>
              <Label variant="accent">Shared State</Label>
            </Box>
            <RecipeDisplay recipe={recipe} onUpdate={handleLocalUpdate} />
          </Box>

          {/* About section */}
          <Box
            sx={{
              padding: 4,
              backgroundColor: 'canvas.subtle',
              borderRadius: 2,
              border: '1px solid',
              borderColor: 'border.default',
            }}
          >
            <Text
              as="h2"
              sx={{ fontSize: 2, fontWeight: 'semibold', marginBottom: 2 }}
            >
              About This Example
            </Text>
            <Text as="p" sx={{ fontSize: 1, color: 'fg.muted' }}>
              This demonstrates bidirectional shared state with AG-UI. The
              recipe state is shared between the frontend and the AI agent. When
              you make changes, they're available to the agent. When the agent
              updates the recipe (via
              <code>display_recipe</code> tool), it emits STATE_SNAPSHOT events
              that update the frontend.
            </Text>
            <Box sx={{ marginTop: 3 }}>
              <Text sx={{ fontSize: 1, fontWeight: 'medium' }}>
                Try these prompts:
              </Text>
              <Box
                as="ul"
                sx={{
                  paddingLeft: 3,
                  marginTop: 1,
                  fontSize: 1,
                  color: 'fg.muted',
                }}
              >
                <li>"Create a recipe for chocolate chip cookies"</li>
                <li>"Add butter and sugar to the ingredients"</li>
                <li>"Update the prep time to 20 minutes"</li>
                <li>"Suggest 3 more ingredients for my recipe"</li>
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Floating chat with initial state */}
        <ChatFloating
          endpoint={SHARED_STATE_ENDPOINT}
          title="Recipe Assistant"
          description="Let's build a recipe together! I can add ingredients, instructions, and more."
          position="bottom-right"
          brandColor="#be185d"
          onStateUpdate={handleStateUpdate}
          suggestions={[
            {
              title: 'Pasta recipe',
              message: 'Help me create a simple pasta recipe.',
            },
            {
              title: 'Add ingredient',
              message: 'Add tomatoes to the recipe.',
            },
          ]}
        />
      </Box>
    </DatalayerThemeProvider>
  );
};

export default AgUiSharedStateExample;
