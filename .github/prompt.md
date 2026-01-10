{paste_prompt_here}
<user_prompt>
user: Build an AI agent using Cloudflare Workflows. The Workflow should run when a new GitHub issue is opened on a specific project with the label 'help' or 'bug', and attempt to help the user troubleshoot the issue by calling the OpenAI API with the issue title and description, and a clear, structured prompt that asks the model to suggest 1-3 possible solutions to the issue. Any code snippets should be formatted in Markdown code blocks. Documentation and sources should be referenced at the bottom of the response. The agent should then post the response to the GitHub issue. The agent should run as the provided GitHub bot account.
</user_prompt>
## https://developers.cloudflare.com/changelog/2025-02-14-example-ai-prompts/