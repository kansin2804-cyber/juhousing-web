.PHONY: harness harness-offline harness-smoke harness-pytest harness-cross-stack

harness:
	@bash harness/run.sh full

harness-offline:
	@bash harness/run.sh offline

harness-smoke:
	@bash harness/smoke/consult_n8n.sh
	@bash harness/smoke/estimate_render.sh

harness-cross-stack:
	@bash /home/ju/workflows/harness/smoke/cross_stack.sh

harness-pytest:
	@/home/ju/n8n-media/.venv/bin/python3 -m pytest harness/regression/ -ra
