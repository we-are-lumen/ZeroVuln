import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

model_path = "./merged_model"

tokenizer = AutoTokenizer.from_pretrained(model_path)
model = AutoModelForCausalLM.from_pretrained(
    model_path,
    torch_dtype=torch.bfloat16,
    device_map="auto"
)

def generate_response(prompt, max_new_tokens=2048):
    messages = [
        {"role": "system", "content": "Generate a secure Solidity smart contract that is safe from the specified vulnerability."},
        {"role": "user", "content": prompt},
    ]

    # Apply chat template
    text = tokenizer.apply_chat_template(
        messages,
        tokenize=False,
        add_generation_prompt=True
    )

    # Tokenize
    inputs = tokenizer(text, return_tensors="pt").to(model.device)

    # Generate
    outputs = model.generate(
        **inputs,
        max_new_tokens=max_new_tokens,
        do_sample=True,
        temperature=0.7,
        top_p=0.9,
    )
    
    # Decode
    response = tokenizer.decode(outputs[0][inputs['input_ids'].shape[1]:], skip_special_tokens=True)
    return response

# Example usage
response = generate_response("Write a contract that interacts with non-standard ERC20 tokens like USDT")
print(response)