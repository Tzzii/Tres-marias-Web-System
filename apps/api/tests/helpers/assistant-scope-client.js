// Only the external classifier responses are fixtures; the real gates still execute.
export function withScopeVerdicts(client) {
  if (!client?.responses) return client;
  return {
    ...client,
    responses: {
      ...client.responses,
      create: (body, options) => {
        const name = body.text?.format?.name;
        if (name === 'tres_marias_scope_input' || name === 'tres_marias_scope_output') {
          return Promise.resolve({
            status: 'completed',
            output: [],
            usage: { input_tokens: 0, output_tokens: 0 },
            output_text: JSON.stringify(
              name === 'tres_marias_scope_input' ? { decision: 'allowed', businessText: '' } : { allowed: true }
            )
          });
        }
        return client.responses.create(body, options);
      }
    }
  };
}
