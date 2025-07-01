
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configPath = path.join(__dirname, 'config.yaml');

const questions = [
  {
    type: 'input',
    name: 'orgName',
    message: 'Enter the organization name:',
    validate: function (value) {
      if (value.length) {
        return true;
      } else {
        return 'Please enter an organization name.';
      }
    },
  },
  {
    type: 'input',
    name: 'orgSlug',
    message: 'Enter the organization slug (e.g., acme-corp):',
    validate: function (value) {
      if (value.length && /^[a-z0-9-]+$/.test(value)) {
        return true;
      } else {
        return 'Please enter a valid slug (lowercase letters, numbers, and hyphens).';
      }
    },
  },
  {
    type: 'input',
    name: 'userName',
    message: "Enter the user's full name:",
    validate: function (value) {
      if (value.length) {
        return true;
      } else {
        return 'Please enter a user name.';
      }
    },
  },
  {
    type: 'input',
    name: 'userEmail',
    message: "Enter the user's email address:",
    validate: function (value) {
      if (/^\S+@\S+\.\S+$/.test(value)) {
        return true;
      } else {
        return 'Please enter a valid email address.';
      }
    },
  },
  {
    type: 'input',
    name: 'userSlug',
    message: "Enter the user's slug (e.g., jane-doe):",
    validate: function (value) {
      if (value.length && /^[a-z0-9-]+$/.test(value)) {
        return true;
      } else {
        return 'Please enter a valid slug (lowercase letters, numbers, and hyphens).';
      }
    },
  },
  {
    type: 'password',
    name: 'openaiApiKey',
    message: 'Enter the OpenAI API key:',
    mask: '*',
  },
  {
    type: 'password',
    name: 'anthropicApiKey',
    message: 'Enter the Anthropic API key:',
    mask: '*',
  },
];

// Correctly indented YAML template
const defaultAssistantTemplate = (orgSlug) => `name: Default Assistant
version: 1.0.0
models:
  - name: GPT-4
    provider: calliope-proxy
    model: openai/gpt-4o
    apiKey: \${{ secrets.${orgSlug}/default-assistant@OPENAI_API_KEY }}
  - name: Claude 3.5 Sonnet
    provider: calliope-proxy
    model: anthropic/claude-3-5-sonnet
    apiKey: \${{ secrets.${orgSlug}/default-assistant@ANTHROPIC_API_KEY }}
context:
  - name: code
    type: highlight
  - name: file
    type: file
prompts:
  - name: system
    template: "You are a helpful AI coding assistant."
  - name: edit
    template: "Please edit the following code according to the instructions."
`;

inquirer.prompt(questions).then((answers) => {
  const { orgName, orgSlug, userName, userEmail, userSlug, openaiApiKey, anthropicApiKey } = answers;

  const orgId = `org-${Date.now()}`;
  const userId = `user-${Date.now() + 1}`; // Ensure different timestamp

  const newOrg = {
    id: orgId,
    slug: orgSlug,
    name: orgName,
    iconUrl: `https://via.placeholder.com/64x64.png?text=${orgSlug.substring(0, 2).toUpperCase()}`,
    tier: 'teams',
    members: [
      {
        userId: userId,
        role: 'admin',
      },
    ],
  };

  const newUser = {
    id: userId,
    slug: userSlug,
    name: userName,
    email: userEmail,
    organizations: [orgId],
    role: 'admin',
  };

  const rawYaml = defaultAssistantTemplate(orgSlug);
  const configFromYaml = yaml.load(rawYaml);

  const newAssistant = {
    ownerSlug: orgSlug,
    packageSlug: 'default-assistant',
    version: '1.0.0',
    iconUrl: `https://via.placeholder.com/64x64.png?text=AI`,
    useOnPremProxy: false,
    rawYaml: rawYaml,
    config: configFromYaml,
  };

  const newSecrets = {
    organization: {
      [orgSlug]: {
        secrets: {
          OPENAI_API_KEY: openaiApiKey,
          ANTHROPIC_API_KEY: anthropicApiKey,
        },
      },
    },
  };

  fs.readFile(configPath, 'utf8', (err, data) => {
    let config;
    if (err) {
      // If the file doesn't exist, create a new one
      if (err.code === 'ENOENT') {
        console.log('config.yaml not found, creating a new one.');
        config = {
            users: [],
            organizations: [],
            assistants: [],
            secrets: {
                user: {},
                organization: {},
                modelsAddOn: {},
                freeTrial: {}
            },
            freeTrialSettings: {
                chatLimit: 100,
                autocompleteLimit: 500,
                defaultOptIn: true,
            }
        };
      } else {
        console.error('Error reading config file:', err);
        return;
      }
    } else {
        config = yaml.load(data);
    }

    // Ensure top-level keys exist
    if (!config.organizations) config.organizations = [];
    if (!config.users) config.users = [];
    if (!config.assistants) config.assistants = [];
    if (!config.secrets) config.secrets = {};
    if (!config.secrets.organization) config.secrets.organization = {};

    // Add new data
    config.organizations.push(newOrg);
    config.users.push(newUser);
    config.assistants.push(newAssistant);
    config.secrets.organization[orgSlug] = newSecrets.organization[orgSlug].secrets;

    const newConfigYaml = yaml.dump(config);

    fs.writeFile(configPath, newConfigYaml, 'utf8', (writeErr) => {
      if (writeErr) {
        console.error('Error writing config file:', writeErr);
      } else {
        console.log('Organization and user onboarded successfully!');
      }
    });
  });
});
