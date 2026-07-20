from openai import OpenAI

client = OpenAI(
  base_url="https://integrate.api.nvidia.com/v1",
  api_key="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"
)

try:
    completion = client.chat.completions.create(
      model="minimaxai/minimax-m3",
      messages=[{"role": "user", "content": "안녕하세요! 자기소개 한 줄 해주세요."}],
      temperature=0.6,
      top_p=0.7,
      max_tokens=200,
      stream=False
    )
    print("✅ 연결 성공!")
    print(completion.choices[0].message.content)
except Exception as e:
    print(f"❌ 에러: {e}")
